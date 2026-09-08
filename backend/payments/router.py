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
    get_order_for_user,
    get_user_orders,
)
from .schemas import CreateOrderRequest, CreateOrderResponse, OrderStatusResponse
from .service import (
    OrderNotDispatchedError,
    OrderNotFoundError,
    PaymentConflictError,
    PaymentVerificationError,
    ServiceNotFoundError,
    cancel_order_with_supplier,
    create_order_payment,
    dispatch_order,
    refill_order_with_supplier,
    reconcile_payment_if_due,
    sync_order_safely,
    sync_order_with_supplier,
    verify_payment_notification,
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
def create_order_endpoint(
    data: CreateOrderRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        return create_order_payment(
            user_id=current_user["id"],
            service_id=data.service_id,
            quantity=data.quantity,
            recipient_link=str(data.recipient_link),
            payment_method=data.payment_method,
            idempotence_key=str(data.idempotence_key),
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
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("YooKassa payment creation failed")
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
        and order["payment_status"] != "canceled"
    ):
        background_tasks.add_task(
            reconcile_payment_if_due,
            order["provider_payment_id"],
        )

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
