import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from backend.core.config import KINGPROMOTION_API_KEY, KINGPROMOTION_API_URL


logger = logging.getLogger(__name__)
SUPPLIER_TIMEOUT_SECONDS = 20
SUPPLIER_ORDER_STATUSES = {
    "In progress",
    "Partial",
    "Pending",
    "Completed",
    "Canceled",
}


class SupplierNotConfiguredError(RuntimeError):
    pass


class SupplierRejectedError(RuntimeError):
    """The supplier explicitly rejected a valid request."""


class SupplierResponseError(RuntimeError):
    """The supplier response cannot be trusted or normalized."""


@dataclass(frozen=True)
class SupplierBalance:
    balance: Decimal
    currency: str


@dataclass(frozen=True)
class SupplierOrder:
    order_id: int


@dataclass(frozen=True)
class SupplierOrderStatus:
    order_id: int
    charge: Decimal
    currency: str
    service_id: int
    link: str
    quantity: int
    start_count: int
    date: str
    status: str
    remains: int


@dataclass(frozen=True)
class SupplierRefill:
    refill_id: int


def _safe_error_message(value: object) -> str:
    message = str(value).strip() or "Поставщик отклонил запрос"
    if KINGPROMOTION_API_KEY:
        message = message.replace(KINGPROMOTION_API_KEY, "[REDACTED]")
    return message[:500]


def _supplier_request(
    action: str,
    params: dict[str, object] | None = None,
) -> dict[str, Any] | list[Any]:
    """Send one secret-bearing, form-encoded request to the supplier."""
    if not KINGPROMOTION_API_KEY:
        raise SupplierNotConfiguredError(
            "KINGPROMOTION_API_KEY не задан в backend/.env"
        )

    form = dict(params or {})
    # Callers cannot override the shared account key or request action.
    form["key"] = KINGPROMOTION_API_KEY
    form["action"] = action
    body = urllib.parse.urlencode(form).encode("utf-8")
    request = urllib.request.Request(
        KINGPROMOTION_API_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(
        request,
        timeout=SUPPLIER_TIMEOUT_SECONDS,
    ) as response:
        raw_payload = response.read()

    try:
        payload = json.loads(raw_payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SupplierResponseError(
            "Поставщик вернул некорректный JSON"
        ) from error

    if not isinstance(payload, (dict, list)):
        raise SupplierResponseError("Поставщик вернул некорректный ответ")
    if isinstance(payload, dict) and payload.get("error"):
        raise SupplierRejectedError(_safe_error_message(payload["error"]))
    return payload


def _require_dict(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SupplierResponseError("Поставщик вернул некорректный объект")
    return payload


def _decimal_field(payload: dict[str, Any], field: str) -> Decimal:
    try:
        value = Decimal(str(payload[field]))
    except (KeyError, InvalidOperation, TypeError, ValueError) as error:
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        ) from error
    if not value.is_finite():
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        )
    return value


def _int_field(payload: dict[str, Any], field: str, *, minimum: int = 0) -> int:
    try:
        value = int(payload[field])
    except (KeyError, TypeError, ValueError) as error:
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        ) from error
    if value < minimum:
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        )
    return value


def _string_field(
    payload: dict[str, Any],
    field: str,
    *,
    allow_empty: bool = False,
) -> str:
    if field not in payload or payload[field] is None:
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        )
    try:
        value = str(payload[field]).strip()
    except (KeyError, TypeError, ValueError) as error:
        raise SupplierResponseError(
            f"Поставщик вернул некорректное поле {field}"
        ) from error
    if not value and not allow_empty:
        raise SupplierResponseError(
            f"Поставщик вернул пустое поле {field}"
        )
    return value


def get_supplier_services() -> list[dict[str, Any]]:
    payload = _supplier_request("services")
    if not isinstance(payload, list) or not all(
        isinstance(item, dict) for item in payload
    ):
        raise SupplierResponseError("Поставщик вернул некорректный каталог услуг")
    return payload


def get_supplier_balance() -> SupplierBalance:
    payload = _require_dict(_supplier_request("balance"))
    balance = _decimal_field(payload, "balance")
    currency = _string_field(payload, "currency").upper()
    if balance < 0 or len(currency) != 3:
        raise SupplierResponseError("Поставщик вернул некорректный баланс")
    logger.info("Supplier balance checked balance=%s currency=%s", balance, currency)
    return SupplierBalance(balance=balance, currency=currency)


def create_supplier_order(
    *,
    service_id: int,
    recipient_link: str,
    quantity: int,
) -> SupplierOrder:
    payload = _require_dict(_supplier_request(
        "add",
        {
            "service": service_id,
            "link": recipient_link,
            "quantity": quantity,
        },
    ))
    return SupplierOrder(order_id=_int_field(payload, "order", minimum=1))


def get_supplier_order_status(supplier_order_id: int) -> SupplierOrderStatus:
    payload = _require_dict(_supplier_request(
        "status",
        {"order": supplier_order_id},
    ))
    status = _string_field(payload, "status")
    if status not in SUPPLIER_ORDER_STATUSES:
        raise SupplierResponseError("Поставщик вернул неизвестный статус заказа")
    currency = _string_field(payload, "currency").upper()
    if len(currency) != 3:
        raise SupplierResponseError("Поставщик вернул некорректную валюту")
    return SupplierOrderStatus(
        order_id=int(supplier_order_id),
        charge=_decimal_field(payload, "charge"),
        currency=currency,
        service_id=_int_field(payload, "service", minimum=1),
        link=_string_field(payload, "link"),
        quantity=_int_field(payload, "quantity"),
        start_count=_int_field(payload, "start_count"),
        date=_string_field(payload, "date"),
        status=status,
        remains=_int_field(payload, "remains"),
    )


def cancel_supplier_order(supplier_order_id: int) -> None:
    payload = _require_dict(_supplier_request(
        "cancel",
        {"order": supplier_order_id},
    ))
    if payload.get("cancel") != "ok":
        raise SupplierResponseError("Поставщик не подтвердил отмену заказа")


def refill_supplier_order(supplier_order_id: int) -> SupplierRefill:
    payload = _require_dict(_supplier_request(
        "refill",
        {"order": supplier_order_id},
    ))
    return SupplierRefill(
        refill_id=_int_field(payload, "refill", minimum=1),
    )
