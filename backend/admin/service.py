"""Операционные сервисы админ-панели: отправка заказов и ручные статусы."""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from backend.admin.audit import record_audit
from backend.core.database import SessionLocal
from backend.payments.repository import get_supplier_attention_orders
from backend.payments.service import (
    OrderNotFoundError,
    retry_dispatch_order,
)
from backend.services.supplier import get_supplier_balance

from . import repository


def get_admin_supplier_balance(*, force_refresh: bool = False):
    # The admin panel must always display the supplier's live API balance.
    # Keep the argument for backward compatibility with existing callers.
    _ = force_refresh
    balance = get_supplier_balance()
    return balance, datetime.now(timezone.utc)


def _required_cost_from_error(message: str | None) -> Decimal | None:
    for item in str(message or "").split():
        if not item.startswith("required="):
            continue
        try:
            value = Decimal(item.removeprefix("required="))
        except InvalidOperation:
            return None
        return value if value.is_finite() else None
    return None


ATTENTION_KIND = {
    "not_started": "awaiting_dispatch",
    "insufficient_supplier_balance": "insufficient_supplier_balance",
    "supplier_unavailable": "supplier_unavailable",
    "unknown": "manual_review",
    "rejected": "manual_review",
    "save_failed": "manual_review",
    "sending": "manual_review",
    "price_changed": "manual_review",
}


def list_supplier_attention_orders() -> list[dict]:
    session = SessionLocal()
    try:
        orders = get_supplier_attention_orders(session)
    finally:
        session.close()
    return [
        {
            "id": order["id"],
            "service_id": order["service_id"],
            "link": order["link"],
            "quantity": order["qnt"],
            "public_amount": format(order["amount"], ".2f"),
            "supplier_cost": (
                format(required, ".2f")
                if (required := _required_cost_from_error(order["dispatch_error"]))
                is not None
                else None
            ),
            "snapshot_cost": (
                format(order["supplier_cost"], ".2f")
                if order.get("supplier_cost") is not None
                else None
            ),
            "currency": "RUB",
            "status": order["status"],
            "dispatch_status": order["dispatch_status"],
            "attention_kind": ATTENTION_KIND.get(
                order["dispatch_status"],
                "manual_review",
            ),
            "can_retry": order["dispatch_status"] in {
                "not_started",
                "insufficient_supplier_balance",
                "supplier_unavailable",
            } and not order["id_rocket"],
            "can_resolve": order["dispatch_status"] in {"sending", "unknown"}
            and not order["id_rocket"],
            "created_at": order["date"],
            "updated_at": order["updated_at"].isoformat()
            if order["updated_at"]
            else None,
        }
        for order in orders
    ]


def retry_blocked_order(order_id: int) -> str:
    return retry_dispatch_order(order_id)


# ---------------------------------------------------------------------------
# Ручное изменение статуса заказа.
# ---------------------------------------------------------------------------

MANUAL_STATUS_TARGETS = {
    "Ожидает отправки",
    "Отменен",
    "Требует проверки",
    "Отклонен поставщиком",
}

RETRYABLE_DISPATCH_STATUSES = {
    "not_started",
    "insufficient_supplier_balance",
    "supplier_unavailable",
}

UNPAID_STATUSES = {"Ожидает оплаты", "Оплата отменена"}


class OrderStatusChangeError(ValueError):
    pass


def _order_is_paid(order: dict) -> bool:
    if order.get("payment_attempt_id") is not None:
        return order["payment_status"] == "processed"
    return order["status"] not in UNPAID_STATUSES


def change_order_status_manual(
    order_id: int,
    new_status: str,
    admin_id: int,
) -> dict:
    """Меняет статус заказа вручную только там, где это безопасно.

    Статус заказов, уже созданных у поставщика (id_rocket != 0), принадлежит
    фоновой синхронизации с поставщиком и вручную не меняется — иначе
    синхронизация рассинхронизируется. Ручное изменение разрешено только
    для оплаченных заказов, ещё не отправленных поставщику.
    """
    if new_status not in MANUAL_STATUS_TARGETS:
        raise OrderStatusChangeError(
            "Недопустимый статус. Доступны: "
            + ", ".join(sorted(MANUAL_STATUS_TARGETS))
        )

    session = SessionLocal()
    try:
        # Все чтение и запись — в одной транзакции: состояние заказа
        # не должно измениться между проверкой и обновлением.
        with session.begin():
            order = repository.get_admin_order(session, order_id)
            if order is None:
                raise OrderNotFoundError(f"Заказ {order_id} не найден")
            if int(order["id_rocket"]) != 0:
                raise OrderStatusChangeError(
                    "Заказ уже отправлен поставщику: его статус "
                    "синхронизируется автоматически и не меняется вручную."
                )
            if not _order_is_paid(order):
                raise OrderStatusChangeError(
                    "Статус можно менять только у оплаченных заказов."
                )
            old_status = order["status"]
            if old_status == new_status:
                return {"id": order_id, "status": new_status}

            updated = repository.update_order_status(session, order_id, new_status)
            if updated is None:
                raise OrderStatusChangeError(
                    "Не удалось изменить статус: заказ изменился."
                )
            if (
                new_status == "Ожидает отправки"
                and order["dispatch_status"] in RETRYABLE_DISPATCH_STATUSES
            ):
                repository.reset_attempt_dispatch(session, order_id)
    finally:
        session.close()

    record_audit(
        admin_id=admin_id,
        action="order_status_changed",
        entity_type="order",
        entity_id=order_id,
        old_value=old_status,
        new_value=new_status,
    )
    return {"id": order_id, "status": new_status}
