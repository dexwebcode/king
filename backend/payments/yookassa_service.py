from decimal import Decimal

from yookassa import Configuration, Payment
from yookassa.domain.exceptions import BadRequestError

from backend.core.config import (
    YOOKASSA_RETURN_URL,
    YOOKASSA_SECRET_KEY,
    YOOKASSA_SHOP_ID,
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
