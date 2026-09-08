from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from threading import Lock
from time import monotonic

from backend.core.database import SessionLocal
from backend.payments.repository import get_supplier_attention_orders
from backend.payments.service import retry_dispatch_order
from backend.services.supplier import SupplierBalance, get_supplier_balance


BALANCE_CACHE_TTL_SECONDS = 15
_balance_cache_lock = Lock()
_balance_cache: tuple[float, SupplierBalance, datetime] | None = None


def get_admin_supplier_balance(*, force_refresh: bool = False):
    global _balance_cache
    now = monotonic()
    with _balance_cache_lock:
        if (
            not force_refresh
            and _balance_cache is not None
            and now - _balance_cache[0] < BALANCE_CACHE_TTL_SECONDS
        ):
            return _balance_cache[1], _balance_cache[2]

        # This cache is only for the admin display. Dispatch never uses it.
        balance = get_supplier_balance()
        checked_at = datetime.now(timezone.utc)
        _balance_cache = (monotonic(), balance, checked_at)
        return balance, checked_at


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
            "quantity": order["qnt"],
            "public_amount": format(order["amount"], ".2f"),
            "supplier_cost": (
                format(required, ".2f")
                if (required := _required_cost_from_error(order["dispatch_error"]))
                is not None
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
            "created_at": order["date"],
            "updated_at": order["updated_at"].isoformat()
            if order["updated_at"]
            else None,
        }
        for order in orders
    ]


def retry_blocked_order(order_id: int) -> str:
    return retry_dispatch_order(order_id)
