from decimal import Decimal

from yookassa import Configuration, Payment
from yookassa.domain.exceptions import BadRequestError

from backend.core.config import (
    YOOKASSA_BALANCE_RETURN_URL,
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
    order_id: int | None,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
    purpose: str = "order",
):
    configure_yookassa()

    try:
        if purpose not in {"order", "balance_topup"}:
            raise ValueError("Неподдерживаемое назначение платежа")
        metadata = {
            "payment_attempt_id": str(attempt_id),
            "user_id": str(user_id),
            "purpose": purpose,
        }
        if order_id is not None:
            metadata["order_id"] = str(order_id)

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
                    "return_url": (
                        YOOKASSA_BALANCE_RETURN_URL
                        if purpose == "balance_topup"
                        else YOOKASSA_RETURN_URL
                    ),
                },
                "description": (
                    "Пополнение баланса King Promotion"
                    if purpose == "balance_topup"
                    else f"Заказ King Promotion №{order_id}"
                ),
                "metadata": metadata,
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
