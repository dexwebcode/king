from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from backend.core.database import SessionLocal
from backend.payments.repository import get_supplier_attention_orders
from backend.payments.service import retry_dispatch_order
from backend.services.supplier import get_supplier_balance


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
