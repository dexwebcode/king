import json
import urllib.parse
import urllib.request
from dataclasses import dataclass

from backend.core.config import KINGPROMOTION_API_KEY, KINGPROMOTION_API_URL


class SupplierNotConfiguredError(RuntimeError):
    pass


class SupplierRejectedError(RuntimeError):
    pass


@dataclass(frozen=True)
class SupplierOrder:
    order_id: int


def create_supplier_order(
    *,
    service_id: int,
    recipient_link: str,
    quantity: int,
) -> SupplierOrder:
    if not KINGPROMOTION_API_KEY:
        raise SupplierNotConfiguredError(
            "KINGPROMOTION_API_KEY не задан в backend/.env"
        )

    body = urllib.parse.urlencode({
        "key": KINGPROMOTION_API_KEY,
        "action": "add",
        "service": service_id,
        "link": recipient_link,
        "quantity": quantity,
    }).encode("utf-8")
    request = urllib.request.Request(
        KINGPROMOTION_API_URL,
        data=body,
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if not isinstance(payload, dict):
        raise SupplierRejectedError("Поставщик вернул некорректный ответ")

    if payload.get("error"):
        raise SupplierRejectedError(str(payload["error"]))

    try:
        order_id = int(payload["order"])
    except (KeyError, TypeError, ValueError) as error:
        raise SupplierRejectedError(
            "Поставщик не вернул ID заказа"
        ) from error

    return SupplierOrder(order_id=order_id)
