"""Клиент платёжной системы Heleket (криптовалютные платежи).

Используется официальный Python SDK (heleket-sdk) и PAYMENT API KEY.
Payout API Key в этом модуле не используется: пополнение баланса —
это только приём платежей.
"""

import logging

from heleket_sdk import (
    ApiError,
    ClientOptions,
    HeleketError,
    HeleketPayment,
    HttpError,
    ValidationError,
)
from heleket_sdk.types import CreateInvoiceRequest, InfoOptions, Invoice

from backend.core.config import (
    HELEKET_API_URL,
    HELEKET_CALLBACK_URL,
    HELEKET_CURRENCY,
    HELEKET_INVOICE_LIFETIME_MINUTES,
    HELEKET_MERCHANT_ID,
    HELEKET_PAYMENT_API_KEY,
    HELEKET_RETURN_URL,
    HELEKET_SUCCESS_URL,
    HELEKET_TIMEOUT_SECONDS,
)


logger = logging.getLogger(__name__)


class HeleketProviderError(RuntimeError):
    """Не удалось обработать запрос к Heleket."""

    pass


class HeleketNotConfiguredError(HeleketProviderError):
    pass


def validate_heleket_configuration() -> None:
    """Проверяет, что Heleket полностью настроен перед обращением к API."""
    required = {
        "HELEKET_MERCHANT_ID": HELEKET_MERCHANT_ID,
        "HELEKET_PAYMENT_API_KEY": HELEKET_PAYMENT_API_KEY,
        "HELEKET_CALLBACK_URL": HELEKET_CALLBACK_URL,
        "HELEKET_SUCCESS_URL": HELEKET_SUCCESS_URL,
        "HELEKET_RETURN_URL": HELEKET_RETURN_URL,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise HeleketNotConfiguredError(
            f"Heleket не настроен: отсутствуют {', '.join(missing)}"
        )
    if not HELEKET_CURRENCY:
        raise HeleketNotConfiguredError("HELEKET_CURRENCY не задана")
    if HELEKET_INVOICE_LIFETIME_MINUTES <= 0:
        raise HeleketNotConfiguredError(
            "HELEKET_INVOICE_LIFETIME_MINUTES должен быть больше нуля"
        )
    if HELEKET_TIMEOUT_SECONDS <= 0:
        raise HeleketNotConfiguredError(
            "HELEKET_TIMEOUT_SECONDS должен быть больше нуля"
        )


def _build_client() -> HeleketPayment:
    validate_heleket_configuration()
    return HeleketPayment(
        merchant_id=HELEKET_MERCHANT_ID,
        api_key=HELEKET_PAYMENT_API_KEY,
        options=ClientOptions(
            base_url=HELEKET_API_URL,
            timeout=HELEKET_TIMEOUT_SECONDS,
        ),
    )


def create_heleket_invoice(
    *,
    amount: str,
    order_id: str,
) -> Invoice:
    """Создаёт инвойс у Heleket. Синхронный вызов SDK (requests).

    Сеть не должна блокировать event loop FastAPI, поэтому вызывать
    функцию нужно либо из sync-эндпоинта (он исполняется в threadpool),
    либо через asyncio.to_thread.
    """
    client = _build_client()
    try:
        return client.create_invoice(
            CreateInvoiceRequest(
                amount=amount,
                currency=HELEKET_CURRENCY,
                order_id=order_id,
                lifetime=HELEKET_INVOICE_LIFETIME_MINUTES * 60,
                url_callback=HELEKET_CALLBACK_URL,
                url_success=HELEKET_SUCCESS_URL,
                url_return=HELEKET_RETURN_URL,
            )
        )
    except (ValidationError, ApiError, HttpError) as error:
        logger.warning(
            "Heleket invoice creation failed order_id=%s error=%s",
            order_id,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket отклонил создание инвойса") from error
    except HeleketError as error:
        logger.warning(
            "Heleket invoice creation failed order_id=%s error=%s",
            order_id,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket временно недоступен") from error


def get_heleket_invoice_by_uuid(uuid: str) -> Invoice:
    client = _build_client()
    try:
        return client.get_info(InfoOptions.by_uuid(uuid))
    except (ValidationError, ApiError, HttpError) as error:
        logger.warning(
            "Heleket invoice info failed uuid=%s error=%s",
            uuid,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket отклонил запрос статуса") from error
    except HeleketError as error:
        logger.warning(
            "Heleket invoice info failed uuid=%s error=%s",
            uuid,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket временно недоступен") from error


def get_heleket_invoice_by_order_id(order_id: str) -> Invoice:
    client = _build_client()
    try:
        return client.get_info(InfoOptions.by_order_id(order_id))
    except (ValidationError, ApiError, HttpError) as error:
        logger.warning(
            "Heleket invoice info failed order_id=%s error=%s",
            order_id,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket отклонил запрос статуса") from error
    except HeleketError as error:
        logger.warning(
            "Heleket invoice info failed order_id=%s error=%s",
            order_id,
            type(error).__name__,
        )
        raise HeleketProviderError("Heleket временно недоступен") from error


def invoice_to_payload(invoice: Invoice) -> dict:
    """Превращает ответ get_info в словарь webhook-события.

    Статус проверяется серверно: get_info — доверенный источник.
    """
    status = invoice.effective_status()
    return {
        "type": "payment",
        "uuid": str(invoice.uuid or ""),
        "order_id": str(invoice.order_id or ""),
        "status": status.value if status is not None else "",
        "amount": str(invoice.amount or ""),
        "payment_amount": str(invoice.payment_amount or ""),
        "merchant_amount": str(invoice.merchant_amount or ""),
        "currency": str(invoice.currency or ""),
        "payer_currency": str(invoice.payer_currency or ""),
        "network": str(invoice.network or ""),
        "txid": str(invoice.txid or ""),
        "commission": str(invoice.commission or ""),
    }
