import asyncio
import json
import logging
from typing import Annotated
from urllib.error import HTTPError, URLError

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from heleket_sdk import SignatureError, WebhookVerifier

from backend.auth.dependencies import get_current_user
from backend.core.config import (
    HELEKET_PAYMENT_API_KEY,
    RATE_LIMIT_PAYMENT_PER_IP,
    RATE_LIMIT_PAYMENT_PER_USER,
)
from backend.core.database import SessionLocal
from backend.core.ratelimit import (
    client_ip,
    enforce_rate_limits,
    enforce_rate_limits_async,
)
from backend.services.supplier import (
    SupplierNotConfiguredError,
    SupplierRejectedError,
    SupplierResponseError,
)
from .heleket_service import (
    HeleketNotConfiguredError,
    HeleketProviderError,
    get_heleket_invoice_by_uuid,
    invoice_to_payload,
    validate_heleket_configuration,
)
from .repository import (
    get_account_summary,
    get_attempt_by_provider_order_id,
    get_balance_topup_for_user,
    get_order_for_user,
    get_payment_attempt_for_user,
    get_user_orders,
    mark_provider_cancel_pending,
    request_payment_cancellation,
)
from .schemas import (
    BalanceTopUpStatusResponse,
    CreateBalanceTopUpRequest,
    CreateBalanceTopUpResponse,
    CreateCrystalPayTopUpRequest,
    CreateCrystalPayTopUpResponse,
    CreateHeleketTopUpRequest,
    CreateHeleketTopUpResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    HeleketPaymentStatusResponse,
    OrderStatusResponse,
    PaymentAttemptStatusResponse,
)
from .service import (
    OrderNotDispatchedError,
    OrderNotFoundError,
    PaymentConflictError,
    PaymentVerificationError,
    ServiceNotFoundError,
    _format_expires_at,
    cancel_order_with_supplier,
    create_balance_topup_payment,
    create_crystalpay_order_payment,
    create_crystalpay_topup,
    create_heleket_order_payment,
    create_heleket_topup,
    create_order_payment,
    dispatch_order,
    refill_order_with_supplier,
    reconcile_crystalpay_invoice_if_due,
    reconcile_heleket_invoice_if_due,
    reconcile_payment_if_due,
    process_crystalpay_invoice,
    process_heleket_webhook_payload,
    process_verified_payment,
    sync_order_safely,
    sync_order_with_supplier,
    verify_payment_notification,
)
from .crystalpay_service import (
    CrystalPayError,
    CrystalPayNotConfiguredError,
    crystalpay_client,
    validate_crystalpay_configuration,
    verify_callback_signature,
)
from .yookassa_service import (
    YooKassaCancelNotAllowedError,
    YooKassaNotConfiguredError,
    YooKassaPaymentMethodUnavailableError,
    cancel_yookassa_payment,
    get_yookassa_payment,
)


logger = logging.getLogger(__name__)
router = APIRouter(tags=["Оплата"])
ALLOWED_WEBHOOK_EVENTS = {
    "payment.succeeded",
    "payment.canceled",
    "payment.waiting_for_capture",
}
MAX_WEBHOOK_BODY_SIZE = 64 * 1024


@router.post(
    "/api/orders",
    response_model=CreateOrderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_order_endpoint(
    data: CreateOrderRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    await enforce_rate_limits_async(
        [
            (f"payment:ip:{client_ip(request)}", RATE_LIMIT_PAYMENT_PER_IP),
            (f"payment:user:{current_user['id']}", RATE_LIMIT_PAYMENT_PER_USER),
        ]
    )
    try:
        arguments = {
            "user_id": current_user["id"],
            "service_id": data.service_id,
            "quantity": data.quantity,
            "recipient_link": str(data.recipient_link),
            "idempotence_key": str(data.idempotence_key),
        }
        if data.payment_method == "crystalpay":
            return await create_crystalpay_order_payment(**arguments)
        if data.payment_method == "heleket":
            return await asyncio.to_thread(create_heleket_order_payment, **arguments)
        return await asyncio.to_thread(
            create_order_payment,
            **arguments,
            payment_method=data.payment_method,
        )
    except ServiceNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PaymentConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except YooKassaNotConfiguredError as error:
        logger.warning("YooKassa configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except YooKassaPaymentMethodUnavailableError as error:
        logger.warning("YooKassa SBP is unavailable: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CrystalPayNotConfiguredError as error:
        logger.error("CrystalPAY configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CrystalPayError as error:
        logger.warning("CrystalPAY order invoice creation failed: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error
    except HeleketNotConfiguredError as error:
        logger.error("Heleket configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except (HeleketProviderError, PaymentVerificationError) as error:
        logger.warning("Heleket order invoice creation failed: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("YooKassa payment creation failed")
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error


@router.post(
    "/api/balance/top-ups",
    response_model=CreateBalanceTopUpResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_balance_topup_endpoint(
    data: CreateBalanceTopUpRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    enforce_rate_limits(
        [
            (f"payment:ip:{client_ip(request)}", RATE_LIMIT_PAYMENT_PER_IP),
            (f"payment:user:{current_user['id']}", RATE_LIMIT_PAYMENT_PER_USER),
        ]
    )
    try:
        return create_balance_topup_payment(
            user_id=current_user["id"],
            amount=data.amount,
            payment_method=data.payment_method,
            idempotence_key=str(data.idempotence_key),
        )
    except PaymentConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except YooKassaNotConfiguredError as error:
        logger.warning("YooKassa configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except YooKassaPaymentMethodUnavailableError as error:
        logger.warning("YooKassa SBP is unavailable: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("YooKassa balance top-up creation failed")
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error


@router.get(
    "/api/balance/top-ups/{top_up_id}",
    response_model=BalanceTopUpStatusResponse,
)
def balance_topup_status_endpoint(
    top_up_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        top_up = get_balance_topup_for_user(
            session,
            top_up_id,
            current_user["id"],
        )
        account = get_account_summary(session, current_user["id"])
    finally:
        session.close()
    if top_up is None or account is None:
        raise HTTPException(status_code=404, detail="Пополнение не найдено")
    if (
        top_up["processed_at"] is None
        and top_up["provider_payment_id"]
        and top_up["status"] not in {
            "canceled",
            "failed",
            "expired",
            "wrongamount",
            "unavailable",
        }
    ):
        if top_up["provider"] == "yookassa":
            background_tasks.add_task(
                reconcile_payment_if_due,
                top_up["provider_payment_id"],
            )
        elif top_up["provider"] == "crystalpay":
            background_tasks.add_task(
                reconcile_crystalpay_invoice_if_due,
                top_up["provider_payment_id"],
            )
        elif top_up["provider"] == "heleket":
            background_tasks.add_task(
                reconcile_heleket_invoice_if_due,
                top_up["provider_payment_id"],
            )
    return {
        "id": top_up["id"],
        "status": top_up["status"],
        "amount": format(top_up["amount"], ".2f"),
        "credited_amount": (
            format(top_up["credited_amount"], ".2f")
            if top_up.get("credited_amount") is not None
            else None
        ),
        "currency": top_up["currency"],
        "provider": top_up["provider"],
        "balance": format(account["balance"], ".2f"),
    }


def _payment_attempt_response(attempt, account=None) -> dict:
    status_value = str(attempt.get('status') or 'pending')
    messages = {
        'cancel_requested': 'Оплата остановлена на сайте. Ссылка удалена из активного платежа.',
        'paid_after_cancel': 'Провайдер принял платёж после отмены. Операция остановлена и требует проверки поддержки.',
        'processed': 'Платёж подтверждён.',
        'expired': 'Срок действия платежа истёк.',
        'canceled': 'Платёж отменён.',
    }
    return {
        'id': attempt['id'],
        'purpose': attempt.get('purpose') or 'order',
        'provider': attempt.get('provider') or 'yookassa',
        'status': status_value,
        'amount': format(attempt['amount'], '.2f'),
        'currency': attempt.get('currency') or 'RUB',
        'confirmation_url': None if status_value in {'cancel_requested', 'canceled', 'paid_after_cancel'} else attempt.get('confirmation_url'),
        'order_id': attempt.get('order_id'),
        'balance': format(account['balance'], '.2f') if account is not None else None,
        'dispatch_status': attempt.get('dispatch_status'),
        'message': messages.get(status_value),
        'expires_at': _format_expires_at(attempt.get('expires_at')),
    }


@router.get('/api/payment-attempts/{attempt_id}', response_model=PaymentAttemptStatusResponse)
async def payment_attempt_status_endpoint(
    attempt_id: int,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        attempt = get_payment_attempt_for_user(session, attempt_id, current_user['id'])
    finally:
        session.close()
    if attempt is None:
        raise HTTPException(status_code=404, detail='Платёж не найден')
    if (
        attempt.get('processed_at') is None
        and attempt.get('provider_payment_id')
        and attempt.get('status') not in {'cancel_requested', 'canceled', 'expired', 'paid_after_cancel'}
    ):
        if attempt.get('provider') == 'crystalpay':
            await reconcile_crystalpay_invoice_if_due(attempt['provider_payment_id'])
        elif attempt.get('provider') == 'heleket':
            await asyncio.to_thread(
                reconcile_heleket_invoice_if_due, attempt['provider_payment_id']
            )
        else:
            await asyncio.to_thread(
                reconcile_payment_if_due, attempt['provider_payment_id']
            )
    session = SessionLocal()
    try:
        attempt = get_payment_attempt_for_user(session, attempt_id, current_user['id'])
        account = get_account_summary(session, current_user['id'])
    finally:
        session.close()
    return _payment_attempt_response(attempt, account)


@router.post('/api/payment-attempts/{attempt_id}/cancel', response_model=PaymentAttemptStatusResponse)
async def cancel_payment_attempt_endpoint(
    attempt_id: int,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        attempt = get_payment_attempt_for_user(session, attempt_id, current_user['id'])
    finally:
        session.close()
    if attempt is None:
        raise HTTPException(status_code=404, detail='Платёж не найден')
    if attempt.get('processed_at') is not None or attempt.get('status') == 'processed':
        raise HTTPException(status_code=409, detail='Оплаченный платёж нельзя отменить')
    if attempt.get('provider') == 'crystalpay' and attempt.get('provider_payment_id'):
        invoice = await crystalpay_client.get_invoice(attempt['provider_payment_id'])
        if str(invoice.get('state') or '').lower() == 'payed':
            result = await asyncio.to_thread(
                process_crystalpay_invoice, attempt['provider_payment_id'], invoice
            )
            if type(result) is int:
                await asyncio.to_thread(dispatch_order, result)
            raise HTTPException(status_code=409, detail='Платёж уже подтверждён провайдером')
    if attempt.get('provider') == 'heleket' and attempt.get('provider_payment_id'):
        invoice = await asyncio.to_thread(
            get_heleket_invoice_by_uuid, attempt['provider_payment_id']
        )
        payload = invoice_to_payload(invoice)
        if payload.get('status') in {'paid', 'paid_over'}:
            result = await asyncio.to_thread(process_heleket_webhook_payload, payload)
            if type(result) is int:
                await asyncio.to_thread(dispatch_order, result)
            raise HTTPException(status_code=409, detail='Платёж уже подтверждён провайдером')
    provider_cancel_pending = False
    if attempt.get('provider') == 'yookassa' and attempt.get('provider_payment_id'):
        payment = None
        try:
            payment = await asyncio.to_thread(
                get_yookassa_payment, attempt['provider_payment_id']
            )
        except Exception as error:
            logger.warning(
                'YooKassa status check failed during cancel attempt_id=%s error=%s',
                attempt['id'],
                type(error).__name__,
            )
            provider_cancel_pending = True
        if payment is not None:
            payment_status = str(getattr(payment, 'status', ''))
            if payment_status == 'succeeded':
                order_id = await asyncio.to_thread(process_verified_payment, payment)
                if order_id is not None:
                    await asyncio.to_thread(dispatch_order, order_id)
                raise HTTPException(
                    status_code=409, detail='Платёж уже подтверждён провайдером'
                )
            if payment_status in {'pending', 'waiting_for_capture'}:
                try:
                    await asyncio.to_thread(
                        cancel_yookassa_payment,
                        attempt['provider_payment_id'],
                        f"cancel-attempt-{attempt['id']}",
                    )
                except YooKassaCancelNotAllowedError as error:
                    # ЮKassa не отменяет одностадийные платежи (capture=true).
                    # Ссылку убираем локально; повтор не поможет — не ставим
                    # флаг provider_cancel_pending, чтобы не было ложных алертов.
                    logger.info(
                        'YooKassa cancel not allowed attempt_id=%s error=%s',
                        attempt['id'],
                        str(error),
                    )
                except Exception as error:
                    logger.warning(
                        'YooKassa cancel failed attempt_id=%s error=%s',
                        attempt['id'],
                        type(error).__name__,
                    )
                    provider_cancel_pending = True
    session = SessionLocal()
    try:
        with session.begin():
            canceled = request_payment_cancellation(session, attempt_id, current_user['id'])
            if canceled is not None and provider_cancel_pending:
                mark_provider_cancel_pending(session, attempt_id)
        account = get_account_summary(session, current_user['id'])
    finally:
        session.close()
    if canceled is None:
        raise HTTPException(status_code=409, detail='Платёж уже завершён или отменён')
    return _payment_attempt_response(canceled, account)


@router.post(
    "/api/payments/crystalpay/create",
    response_model=CreateCrystalPayTopUpResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_crystalpay_topup_endpoint(
    data: CreateCrystalPayTopUpRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    await enforce_rate_limits_async(
        [
            (f"payment:ip:{client_ip(request)}", RATE_LIMIT_PAYMENT_PER_IP),
            (f"payment:user:{current_user['id']}", RATE_LIMIT_PAYMENT_PER_USER),
        ]
    )
    try:
        return await create_crystalpay_topup(
            user_id=current_user["id"],
            amount=data.amount,
            idempotence_key=str(data.idempotence_key),
        )
    except PaymentConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except CrystalPayNotConfiguredError as error:
        logger.error("CrystalPAY configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (CrystalPayError, PaymentVerificationError) as error:
        logger.warning("CrystalPAY invoice creation failed: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error
    except Exception as error:
        logger.exception("CrystalPAY invoice creation failed")
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error


@router.post(
    "/api/payments/heleket/create",
    response_model=CreateHeleketTopUpResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_heleket_topup_endpoint(
    data: CreateHeleketTopUpRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Пополнение баланса криптовалютой через Heleket.

    Sync-эндпоинт: FastAPI исполняет его в threadpool, поэтому синхронный
    SDK-клиент Heleket не блокирует event loop.
    """
    enforce_rate_limits(
        [
            (f"payment:ip:{client_ip(request)}", RATE_LIMIT_PAYMENT_PER_IP),
            (f"payment:user:{current_user['id']}", RATE_LIMIT_PAYMENT_PER_USER),
        ]
    )
    try:
        return create_heleket_topup(
            user_id=current_user["id"],
            amount=data.amount,
            idempotence_key=str(data.idempotence_key),
        )
    except PaymentConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except HeleketNotConfiguredError as error:
        logger.error("Heleket configuration error: %s", error)
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except (HeleketProviderError, PaymentVerificationError) as error:
        logger.warning("Heleket invoice creation failed: %s", type(error).__name__)
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error
    except Exception as error:
        logger.exception("Heleket invoice creation failed")
        raise HTTPException(
            status_code=502,
            detail="Не удалось создать платёж. Попробуйте ещё раз.",
        ) from error


@router.post("/api/payments/heleket/webhook")
async def heleket_webhook(request: Request, background_tasks: BackgroundTasks):
    """Webhook Heleket. JWT не требуется — подпись проверяется RAW body.

    Баланс зачисляется только после криптографически верного webhook.
    """
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Слишком большой webhook")

    try:
        validate_heleket_configuration()
    except HeleketNotConfiguredError as error:
        logger.error("Heleket is not configured")
        raise HTTPException(status_code=503, detail="Heleket не настроен") from error

    verifier = WebhookVerifier(HELEKET_PAYMENT_API_KEY)
    try:
        payload = verifier.verify_raw(body)
    except (SignatureError, ValueError) as error:
        logger.warning("Heleket webhook invalid signature: %s", type(error).__name__)
        raise HTTPException(status_code=400, detail="Invalid Heleket signature") from error

    if not payload.is_payment():
        raise HTTPException(status_code=400, detail="Неподдерживаемый тип события")

    logger.info(
        "Heleket webhook received order_id=%s uuid=%s status=%s",
        payload.order_id,
        payload.uuid,
        payload.status,
    )
    try:
        result = await asyncio.to_thread(process_heleket_webhook_payload, payload.raw)
        if type(result) is int:
            background_tasks.add_task(dispatch_order, result)
        credited = bool(result)
    except PaymentVerificationError as error:
        logger.warning("Heleket webhook verification failed: %s", error)
        raise HTTPException(status_code=400, detail="Платёж не подтверждён") from error
    except Exception as error:
        logger.exception("Heleket webhook processing failed")
        raise HTTPException(status_code=500, detail="Ошибка обработки платежа") from error
    return {"status": "ok", "credited": credited}


@router.get(
    "/api/payments/heleket/{order_id}/status",
    response_model=HeleketPaymentStatusResponse,
)
def heleket_payment_status_endpoint(
    order_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Статус пополнения Heleket по локальному order_id.

    Чужой платёж неотличим от несуществующего — отвечаем 404.
    """
    session = SessionLocal()
    try:
        attempt = get_attempt_by_provider_order_id(
            session, order_id, provider="heleket"
        )
    finally:
        session.close()
    if attempt is None or attempt["user_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Платёж не найден")
    if (
        attempt["processed_at"] is None
        and attempt["provider_payment_id"]
        and attempt["status"] not in {"canceled", "failed", "expired", "wrongamount", "locked"}
    ):
        background_tasks.add_task(
            reconcile_heleket_invoice_if_due,
            attempt["provider_payment_id"],
        )
    session = SessionLocal()
    try:
        account = get_account_summary(session, current_user["id"])
    finally:
        session.close()
    return {
        "order_id": order_id,
        "status": attempt["status"],
        "credited": attempt["processed_at"] is not None,
        "amount": format(attempt["amount"], ".2f"),
        "currency": attempt["currency"] or "RUB",
        "balance": format(account["balance"], ".2f") if account is not None else None,
    }


# Внутренние статусы заказа так, как их видит покупатель во вкладке «Мои заказы».
_ORDER_DISPLAY_STATUS = {
    "Ожидает оплаты": "Ожидает оплаты",
    "Ожидает отправки": "Оплачен",
    "Отправляется": "Оплачен",
    "Ожидает пополнения поставщика": "Оплачен",
    "Поставщик недоступен": "Оплачен",
    "Выполняется": "Оплачен",
    "Готово": "Выполнен",
    "Завершен": "Выполнен",
    "Частично": "Выполнен частично",
    "Оплата отменена": "Отменён",
    "Отменен": "Отменён",
    "Отменен поставщиком": "Отменён",
    "Отмена запрошена": "Отмена в обработке",
    "Требует проверки": "Требует проверки",
    "Отклонен поставщиком": "Отклонён поставщиком",
    "Цена изменилась": "Требует проверки",
}


def display_order_status(status: str | None) -> str:
    """Переводит внутренний статус заказа в покупательский.

    @param status - значение orders.status.
    @returns «Ожидает оплаты», «Оплачен» или «Отменён»; неизвестное значение
    возвращается как есть.
    """
    value = str(status or "")
    return _ORDER_DISPLAY_STATUS.get(value, value)


def _order_message(order) -> str | None:
    if order["status"] == "Ожидает пополнения поставщика":
        return "Заказ оплачен и ожидает пополнения рабочего баланса поставщика."
    if order["status"] == "Поставщик недоступен":
        return "Заказ оплачен. Поставщик временно недоступен, заказ сохранён."
    if order["status"] == "Требует проверки":
        return "Оплата принята. Отправка заказа проверяется поддержкой."
    if order["status"] == "Отклонен поставщиком":
        return "Поставщик отклонил заказ. Требуется проверка администратора."
    if order["status"] == "Цена изменилась":
        return "Себестоимость поставщика выросла после оплаты. Заказ передан на проверку поддержки."
    if order["status"] == "Отмена запрошена":
        return "Поставщик принял запрос на отмену. Финансовый результат не подтверждён."
    if order["status"] == "Оплата отменена":
        return "Платёж отменён, баланс не изменён."
    return None


@router.get(
    "/api/orders/{order_id}",
    response_model=OrderStatusResponse,
)
def order_status_endpoint(
    order_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        order = get_order_for_user(session, order_id, current_user["id"])
    finally:
        session.close()

    if order is None:
        raise HTTPException(status_code=404, detail="Заказ не найден")
    if order["status"] == "Ожидает отправки":
        background_tasks.add_task(dispatch_order, order_id)
    elif (
        order["id_rocket"]
        and order["status"] not in {"Завершен", "Отменен поставщиком", "Готово", "Отменен"}
    ):
        background_tasks.add_task(
            sync_order_safely,
            order_id,
            current_user["id"],
        )
    elif (
        order["processed_at"] is None
        and order["provider_payment_id"]
        and order["payment_status"] not in {"canceled", "cancel_requested", "paid_after_cancel"}
    ):
        if order.get("provider") == "crystalpay":
            reconciliation = reconcile_crystalpay_invoice_if_due
        elif order.get("provider") == "heleket":
            reconciliation = reconcile_heleket_invoice_if_due
        else:
            reconciliation = reconcile_payment_if_due
        background_tasks.add_task(reconciliation, order["provider_payment_id"])

    return {
        "id": order["id"],
        "status": order["status"],
        "display_status": display_order_status(order["status"]),
        "amount": format(order["amount"], ".2f"),
        "currency": order["currency"] or "RUB",
        "payment_status": order["payment_status"],
        "dispatch_status": order["dispatch_status"],
        "message": _order_message(order),
    }


def _supplier_http_error(error: Exception) -> HTTPException:
    if isinstance(error, SupplierNotConfiguredError):
        return HTTPException(status_code=503, detail="Поставщик не настроен")
    if isinstance(error, SupplierRejectedError):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=502, detail="Некорректный ответ поставщика")


@router.post("/api/orders/{order_id}/sync")
def sync_order_endpoint(
    order_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        supplier_status, local_status = sync_order_with_supplier(
            order_id,
            current_user["id"],
        )
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OrderNotDispatchedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
    ) as error:
        raise _supplier_http_error(error) from error
    return {
        "id": order_id,
        "status": local_status,
        "supplier_status": supplier_status.status,
        "charge": format(supplier_status.charge, "f"),
        "currency": supplier_status.currency,
        "quantity": supplier_status.quantity,
        "start_count": supplier_status.start_count,
        "remains": supplier_status.remains,
    }


@router.post("/api/orders/{order_id}/cancel")
def cancel_order_endpoint(
    order_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        cancel_order_with_supplier(order_id, current_user["id"])
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OrderNotDispatchedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
    ) as error:
        raise _supplier_http_error(error) from error
    return {
        "success": True,
        "status": "Отмена запрошена",
        "message": "Баланс пользователя не изменён: финансовый результат ещё не подтверждён.",
    }


@router.post("/api/orders/{order_id}/refill")
def refill_order_endpoint(
    order_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        refill = refill_order_with_supplier(order_id, current_user["id"])
    except OrderNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except OrderNotDispatchedError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
    ) as error:
        raise _supplier_http_error(error) from error
    return {"success": True, "refill_id": refill.refill_id}


@router.get("/api/me")
def account_summary_endpoint(current_user: dict = Depends(get_current_user)):
    session = SessionLocal()
    try:
        account = get_account_summary(session, current_user["id"])
    finally:
        session.close()
    if account is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    return {
        "id": account["id"],
        "login": account["login"],
        "balance": format(account["balance"], ".2f"),
    }


@router.get("/api/my-orders")
def my_orders_endpoint(
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    before_id: Annotated[int | None, Query()] = None,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        orders = get_user_orders(
            session,
            current_user["id"],
            limit=limit + 1,
            before_id=before_id,
        )
    finally:
        session.close()
    # Статусы активных заказов обновляет фоновый ограниченный worker
    # (sync_due_orders), а не fan-out при открытии списка.
    has_more = len(orders) > limit
    items = orders[:limit]
    next_cursor = items[-1]["id"] if has_more else None
    return {
        "items": [
            {
                "id": item["id"],
                "platform": item["soc"],
                "service_id": item["service_id"],
                "link": item["link"],
                "quantity": item["qnt"],
                "amount": format(item["amount"], ".2f"),
                "status": item["status"],
                "display_status": display_order_status(item["status"]),
                "dispatch_status": item["dispatch_status"],
                "remains": item["remains"],
                "created_at": item["date"],
            }
            for item in items
        ],
        "next_cursor": next_cursor,
    }


@router.get("/api/my-balance")
def my_balance_endpoint(current_user: dict = Depends(get_current_user)):
    session = SessionLocal()
    try:
        account = get_account_summary(session, current_user["id"])
    finally:
        session.close()
    if account is None:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    return {"balance": format(account["balance"], ".2f")}


@router.post("/api/payments/yookassa/webhook")
async def yookassa_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Слишком большой webhook")

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Некорректный JSON") from error

    event = str(payload.get("event", ""))
    payment_id = str(payload.get("object", {}).get("id", ""))
    if event not in ALLOWED_WEBHOOK_EVENTS:
        raise HTTPException(status_code=400, detail="Неподдерживаемое событие")
    if not payment_id:
        raise HTTPException(status_code=400, detail="payment_id отсутствует")

    logger.info("YooKassa webhook received event=%s", event)
    try:
        order_id = await asyncio.to_thread(verify_payment_notification, payment_id)
    except (PaymentVerificationError, PaymentConflictError) as error:
        logger.warning("YooKassa payment verification failed: %s", error)
        raise HTTPException(status_code=400, detail="Платёж не подтверждён") from error
    except YooKassaNotConfiguredError as error:
        logger.error("YooKassa is not configured")
        raise HTTPException(status_code=503, detail="ЮKassa не настроена") from error
    except Exception as error:
        logger.exception("YooKassa webhook processing failed")
        raise HTTPException(status_code=502, detail="Ошибка проверки платежа") from error

    if order_id is not None:
        logger.info(
            "YooKassa payment verified order_id=%s payment_id=%s",
            order_id,
            payment_id,
        )
        background_tasks.add_task(dispatch_order, order_id)
    return {"status": "ok"}


@router.post("/api/payments/crystalpay/callback")
async def crystalpay_callback(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Слишком большой callback")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Некорректный JSON") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Некорректный callback")

    invoice_id = str(payload.get("id") or "").strip()
    signature = str(payload.get("signature") or "").strip()
    if not invoice_id or not signature:
        raise HTTPException(status_code=400, detail="ID или подпись отсутствуют")
    try:
        validate_crystalpay_configuration(require_salt=True)
    except CrystalPayNotConfiguredError as error:
        logger.error("CrystalPAY callback configuration error: %s", error)
        raise HTTPException(status_code=503, detail="CrystalPAY не настроен") from error

    signature_valid = verify_callback_signature(invoice_id, signature)
    logger.info(
        "CrystalPAY callback received invoice_id=%s signature_valid=%s",
        invoice_id,
        signature_valid,
    )
    if not signature_valid:
        raise HTTPException(status_code=401, detail="Некорректная подпись")

    try:
        invoice = await crystalpay_client.get_invoice(invoice_id)
        result = await asyncio.to_thread(process_crystalpay_invoice, invoice_id, invoice)
        if type(result) is int:
            background_tasks.add_task(dispatch_order, result)
        credited = bool(result)
    except PaymentVerificationError as error:
        logger.warning(
            "CrystalPAY callback verification failed invoice_id=%s error=%s",
            invoice_id,
            error,
        )
        raise HTTPException(status_code=400, detail="Платёж не подтверждён") from error
    except CrystalPayNotConfiguredError as error:
        logger.error("CrystalPAY callback configuration error: %s", error)
        raise HTTPException(status_code=503, detail="CrystalPAY не настроен") from error
    except CrystalPayError as error:
        logger.warning(
            "CrystalPAY callback API error invoice_id=%s error=%s",
            invoice_id,
            type(error).__name__,
        )
        raise HTTPException(status_code=502, detail="Ошибка проверки платежа") from error
    except Exception as error:
        logger.exception("CrystalPAY callback processing failed invoice_id=%s", invoice_id)
        raise HTTPException(status_code=500, detail="Ошибка обработки платежа") from error
    return {"status": "ok", "credited": credited}
