import json
import logging

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
from .repository import (
    get_account_summary,
    get_order_for_user,
    get_user_orders,
)
from .schemas import CreateOrderRequest, CreateOrderResponse, OrderStatusResponse
from .service import (
    PaymentConflictError,
    PaymentVerificationError,
    ServiceNotFoundError,
    create_order_payment,
    dispatch_order,
    reconcile_payment_if_due,
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
        raise HTTPException(status_code=503, detail=str(error)) from error
    except YooKassaPaymentMethodUnavailableError as error:
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
    if order["status"] == "Требует проверки":
        return "Оплата принята. Отправка заказа проверяется поддержкой."
    if order["status"] == "Отменен" and order["processed_at"] is not None:
        return "Поставщик отклонил заказ. Средства возвращены на баланс."
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
def my_orders_endpoint(current_user: dict = Depends(get_current_user)):
    session = SessionLocal()
    try:
        orders = get_user_orders(session, current_user["id"])
    finally:
        session.close()
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
