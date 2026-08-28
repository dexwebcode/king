from decimal import Decimal

from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from yookassa import Configuration, Payment, Webhook
from yookassa.domain.exceptions import BadRequestError

from backend.core.config import (
    YOOKASSA_RETURN_URL,
    YOOKASSA_SECRET_KEY,
    YOOKASSA_SHOP_ID,
    YOOKASSA_WEBHOOK_URL,
)


class YooKassaNotConfiguredError(RuntimeError):
    pass


class YooKassaPaymentMethodUnavailableError(RuntimeError):
    pass


def configure_yookassa() -> None:
    if not YOOKASSA_SHOP_ID or not YOOKASSA_SECRET_KEY:
        raise YooKassaNotConfiguredError(
            "YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY не настроены"
        )
    if not YOOKASSA_RETURN_URL:
        raise YooKassaNotConfiguredError(
            "YOOKASSA_RETURN_URL не настроен"
        )

    Configuration.configure(YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY)


def create_yookassa_payment(
    *,
    attempt_id: int,
    order_id: int,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
):
    configure_yookassa()

    try:
        return Payment.create(
            {
                "amount": {
                    "value": format(amount, ".2f"),
                    "currency": "RUB",
                },
                "payment_method_data": {
                    "type": "sbp",
                },
                "capture": True,
                "confirmation": {
                    "type": "redirect",
                    "return_url": YOOKASSA_RETURN_URL,
                },
                "description": f"Заказ King Promotion №{order_id}",
                "metadata": {
                    "payment_attempt_id": str(attempt_id),
                    "order_id": str(order_id),
                    "user_id": str(user_id),
                },
            },
            idempotence_key,
        )
    except BadRequestError as error:
        if "payment method is not available" in str(error).lower():
            raise YooKassaPaymentMethodUnavailableError(
                "СБП не подключён для этого магазина ЮKassa"
            ) from error
        raise


def get_yookassa_payment(payment_id: str):
    configure_yookassa()
    return Payment.find_one(payment_id)


def sync_yookassa_webhooks() -> list[str]:
    configure_yookassa()
    parsed_url = urlparse(YOOKASSA_WEBHOOK_URL)
    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise YooKassaNotConfiguredError(
            "YOOKASSA_WEBHOOK_URL должен быть публичным HTTPS URL"
        )
    if parsed_url.path.rstrip("/") != "/api/payments/yookassa/webhook":
        raise YooKassaNotConfiguredError(
            "YOOKASSA_WEBHOOK_URL должен оканчиваться на "
            "/api/payments/yookassa/webhook"
        )

    required_events = {"payment.succeeded", "payment.canceled"}
    configured = {
        (str(item.event), str(item.url))
        for item in (Webhook.list().items or [])
    }
    added = []
    for event in sorted(required_events):
        if (event, YOOKASSA_WEBHOOK_URL) in configured:
            continue
        Webhook.add({"event": event, "url": YOOKASSA_WEBHOOK_URL})
        added.append(event)
    return added


def is_yookassa_webhook_reachable() -> bool:
    if not YOOKASSA_WEBHOOK_URL:
        return False
    request = Request(YOOKASSA_WEBHOOK_URL, method="GET")
    request.add_header("ngrok-skip-browser-warning", "1")
    try:
        with urlopen(request, timeout=8) as response:
            return response.status in {200, 405}
    except HTTPError as error:
        return error.code == 405
    except (URLError, TimeoutError, OSError):
        return False
