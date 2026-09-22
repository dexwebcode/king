import hashlib
import hmac
import logging
from decimal import Decimal
from typing import Any

import aiohttp

from backend.core.config import (
    CRYSTALPAY_API_URL,
    CRYSTALPAY_AUTH_LOGIN,
    CRYSTALPAY_AUTH_SECRET,
    CRYSTALPAY_CALLBACK_URL,
    CRYSTALPAY_INVOICE_LIFETIME_MINUTES,
    CRYSTALPAY_REDIRECT_URL,
    CRYSTALPAY_SALT,
    CRYSTALPAY_TIMEOUT_SECONDS,
)


logger = logging.getLogger(__name__)


class CrystalPayError(RuntimeError):
    pass


class CrystalPayNotConfiguredError(CrystalPayError):
    pass


class CrystalPayAPIError(CrystalPayError):
    pass


class CrystalPayResponseError(CrystalPayError):
    pass


def validate_crystalpay_configuration(*, require_salt: bool = False) -> None:
    required = {
        "CRYSTALPAY_AUTH_LOGIN": CRYSTALPAY_AUTH_LOGIN,
        "CRYSTALPAY_AUTH_SECRET": CRYSTALPAY_AUTH_SECRET,
        "CRYSTALPAY_CALLBACK_URL": CRYSTALPAY_CALLBACK_URL,
        "CRYSTALPAY_REDIRECT_URL": CRYSTALPAY_REDIRECT_URL,
    }
    if require_salt:
        required["CRYSTALPAY_SALT"] = CRYSTALPAY_SALT
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise CrystalPayNotConfiguredError(
            f"CrystalPAY не настроен: отсутствуют {', '.join(missing)}"
        )
    if CRYSTALPAY_INVOICE_LIFETIME_MINUTES <= 0:
        raise CrystalPayNotConfiguredError(
            "CRYSTALPAY_INVOICE_LIFETIME_MINUTES должен быть больше нуля"
        )
    if CRYSTALPAY_TIMEOUT_SECONDS <= 0:
        raise CrystalPayNotConfiguredError(
            "CRYSTALPAY_TIMEOUT_SECONDS должен быть больше нуля"
        )


def verify_callback_signature(invoice_id: str, signature: str) -> bool:
    if not invoice_id or not signature or not CRYSTALPAY_SALT:
        return False
    calculated = hashlib.sha1(
        f"{invoice_id}:{CRYSTALPAY_SALT}".encode("utf-8")
    ).hexdigest()
    return hmac.compare_digest(calculated, signature)


class CrystalPayClient:
    async def _request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        validate_crystalpay_configuration()
        body = {
            "auth_login": CRYSTALPAY_AUTH_LOGIN,
            "auth_secret": CRYSTALPAY_AUTH_SECRET,
            **payload,
        }
        timeout = aiohttp.ClientTimeout(total=CRYSTALPAY_TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as client:
                async with client.post(
                    f"{CRYSTALPAY_API_URL}{path.lstrip('/')}",
                    json=body,
                    headers={"Content-Type": "application/json"},
                ) as response:
                    if response.status < 200 or response.status >= 300:
                        raise CrystalPayAPIError(
                            f"CrystalPAY вернул HTTP {response.status}"
                        )
                    try:
                        data = await response.json(content_type=None)
                    except (ValueError, TypeError) as error:
                        raise CrystalPayResponseError(
                            "CrystalPAY вернул некорректный JSON"
                        ) from error
        except CrystalPayError:
            raise
        except (aiohttp.ClientError, TimeoutError) as error:
            logger.warning("CrystalPAY network error: %s", type(error).__name__)
            raise CrystalPayAPIError("CrystalPAY временно недоступен") from error

        if not isinstance(data, dict):
            raise CrystalPayResponseError("CrystalPAY вернул некорректный ответ")
        if data.get("error") is not False:
            errors = data.get("errors")
            message = "; ".join(str(item) for item in errors) if isinstance(errors, list) else ""
            raise CrystalPayAPIError(message or "CrystalPAY отклонил запрос")
        errors = data.get("errors")
        if errors not in (None, []):
            raise CrystalPayAPIError("CrystalPAY вернул ошибки в ответе")
        return data

    async def create_invoice(
        self,
        *,
        amount: Decimal,
        extra: str,
        invoice_type: str = "topup",
        description: str = "Пополнение баланса KingPromotion",
        redirect_url: str | None = None,
    ) -> dict[str, Any]:
        if invoice_type not in {"topup", "purchase"}:
            raise ValueError("Неподдерживаемый тип инвойса CrystalPAY")
        return await self._request(
            "invoice/create/",
            {
                "amount": format(amount, ".2f"),
                "type": invoice_type,
                "lifetime": CRYSTALPAY_INVOICE_LIFETIME_MINUTES,
                "currency": "RUB",
                "description": description,
                "extra": extra,
                "redirect_url": redirect_url or CRYSTALPAY_REDIRECT_URL,
                "callback_url": CRYSTALPAY_CALLBACK_URL,
            },
        )

    async def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        return await self._request("invoice/info/", {"id": invoice_id})


crystalpay_client = CrystalPayClient()
