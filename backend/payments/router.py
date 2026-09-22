import json
import logging
from urllib.error import HTTPError, URLError

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)

from backend.auth.dependencies import get_current_user
from backend.core.database import SessionLocal
from backend.services.supplier import (
    SupplierNotConfiguredError,
    SupplierRejectedError,
    SupplierResponseError,
)
from .repository import (
    get_account_summary,
    get_balance_topup_for_user,
    get_order_for_user,
    get_payment_attempt_for_user,
    request_payment_cancellation,
    get_user_orders,
)
from .schemas import (
    BalanceTopUpStatusResponse,
    CreateBalanceTopUpRequest,
    CreateBalanceTopUpResponse,
    CreateCrystalPayTopUpRequest,
    CreateCrystalPayTopUpResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    OrderStatusResponse,
    PaymentAttemptStatusResponse,
)
from .service import (
    OrderNotDispatchedError,
    OrderNotFoundError,
    PaymentConflictError,
    PaymentVerificationError,
    ServiceNotFoundError,
    cancel_order_with_supplier,
    create_balance_topup_payment,
    create_crystalpay_order_payment,
    create_crystalpay_topup,
    create_order_payment,
    dispatch_order,
    refill_order_with_supplier,
    reconcile_crystalpay_invoice_if_due,
    reconcile_payment_if_due,
    process_crystalpay_invoice,
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
    YooKassaNotConfiguredError,
    YooKassaPaymentMethodUnavailableError,
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
    current_user: dict = Depends(get_current_user),
):
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
        return create_order_payment(
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
    current_user: dict = Depends(get_current_user),
):
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
        else:
            reconcile_payment_if_due(attempt['provider_payment_id'])
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
            result = process_crystalpay_invoice(attempt['provider_payment_id'], invoice)
            if type(result) is int:
                dispatch_order(result)
            raise HTTPException(status_code=409, detail='Платёж уже подтверждён провайдером')
    session = SessionLocal()
    try:
        with session.begin():
            canceled = request_payment_cancellation(session, attempt_id, current_user['id'])
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
    current_user: dict = Depends(get_current_user),
):
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


def _order_message(order) -> str | None:
    if order["status"] == "Ожидает пополнения поставщика":
        return "Заказ оплачен и ожидает пополнения рабочего баланса поставщика."
    if order["status"] == "Поставщик недоступен":
        return "Заказ оплачен. Поставщик временно недоступен, заказ сохранён."
    if order["status"] == "Требует проверки":
        return "Оплата принята. Отправка заказа проверяется поддержкой."
    if order["status"] == "Отклонен поставщиком":
        return "Поставщик отклонил заказ. Требуется проверка администратора."
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
        and order["status"] not in {"Завершен", "Отменен поставщиком"}
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
        reconciliation = (
            reconcile_crystalpay_invoice_if_due
            if order.get("provider") == "crystalpay"
            else reconcile_payment_if_due
        )
        background_tasks.add_task(reconciliation, order["provider_payment_id"])

    return {
        "id": order["id"],
        "status": order["status"],
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
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    session = SessionLocal()
    try:
        orders = get_user_orders(session, current_user["id"])
    finally:
        session.close()
    for item in orders:
        if item["id_rocket"] and item["status"] not in {
            "Завершен",
            "Отменен поставщиком",
        }:
            background_tasks.add_task(
                sync_order_safely,
                item["id"],
                current_user["id"],
            )
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
                "dispatch_status": item["dispatch_status"],
                "remains": item["remains"],
                "created_at": item["date"],
            }
            for item in orders
        ]
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
        order_id = verify_payment_notification(payment_id)
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
        result = process_crystalpay_invoice(invoice_id, invoice)
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
