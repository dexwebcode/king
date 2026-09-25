import asyncio
import logging
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from threading import Lock
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError

from backend.core.config import (
    CRYSTALPAY_ORDER_REDIRECT_URL,
    PAYMENT_TIMEOUT_MINUTES,
    REFERRAL_REWARD_PERCENT,
    YOOKASSA_BALANCE_RETURN_URL,
    YOOKASSA_RETURN_URL,
)
from backend.core.database import SessionLocal
from backend.services.get_price import (
    calculate_order_amount,
    calculate_supplier_order_cost,
    get_service_by_id,
    validate_service_quantity,
)
from backend.services.supplier import (
    SupplierNotConfiguredError,
    SupplierRejectedError,
    SupplierResponseError,
    cancel_supplier_order,
    create_supplier_order,
    get_supplier_balance,
    get_supplier_order_status,
    refill_supplier_order,
)
from .repository import (
    add_referral_reward,
    claim_payment_reconciliation,
    claim_order_for_dispatch,
    complete_order_dispatch,
    create_balance_topup_attempt,
    create_balance_transaction,
    create_expense,
    create_order_with_payment_attempt,
    expire_payment_attempt,
    get_attempt_by_idempotence_key,
    get_attempt_by_payment_id,
    get_attempt_by_provider_order_id,
    get_order_dispatch_state,
    get_order_for_user,
    list_expired_unpaid_attempts,
    lock_order,
    lock_user,
    mark_dispatch_rejected,
    mark_dispatch_unknown,
    mark_insufficient_supplier_balance,
    mark_order_cancel_requested,
    mark_order_paid,
    mark_payment_canceled,
    mark_payment_paid_after_cancel,
    mark_payment_processed,
    mark_supplier_precheck_unavailable,
    record_supplier_order_for_review,
    set_attempt_error,
    set_attempt_heleket_details,
    set_attempt_payment_details,
    set_attempt_status,
    set_user_balance,
    update_order_from_supplier,
)
from .crystalpay_service import crystalpay_client, validate_crystalpay_configuration
from .heleket_service import (
    HeleketNotConfiguredError,
    HeleketProviderError,
    create_heleket_invoice,
    get_heleket_invoice_by_uuid,
    invoice_to_payload,
    validate_heleket_configuration,
)
from .yookassa_service import (
    cancel_yookassa_payment,
    create_yookassa_payment,
    get_yookassa_payment,
)


logger = logging.getLogger(__name__)
MONEY_STEP = Decimal("0.01")
MOSCOW_TIMEZONE = ZoneInfo("Europe/Moscow")
STATUS_SYNC_INTERVAL_SECONDS = 15
_status_sync_lock = Lock()
_status_sync_started_at: dict[int, float] = {}


class ServiceNotFoundError(ValueError):
    pass


class PaymentVerificationError(RuntimeError):
    pass


class PaymentConflictError(RuntimeError):
    pass


class OrderNotFoundError(LookupError):
    pass


class OrderNotDispatchedError(ValueError):
    pass


class RetryDispatchError(ValueError):
    pass


def _legacy_now() -> str:
    return datetime.now(MOSCOW_TIMEZONE).strftime("%H:%M:%S %d.%m.%Y")


def _money(value) -> Decimal:
    try:
        return Decimal(str(value)).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as error:
        raise PaymentVerificationError("Некорректная сумма платежа") from error


def _confirmation_url(payment) -> str | None:
    confirmation = getattr(payment, "confirmation", None)
    return getattr(confirmation, "confirmation_url", None)


def _payment_method_type(payment) -> str:
    payment_method = getattr(payment, "payment_method", None)
    return str(getattr(payment_method, "type", ""))


def _payment_response(attempt) -> dict:
    confirmation_url = attempt.get("confirmation_url")
    if attempt.get("processed_at") is not None and not confirmation_url:
        confirmation_url = YOOKASSA_RETURN_URL
    return {
        "order_id": attempt["order_id"],
        "attempt_id": attempt["id"],
        "payment_id": attempt.get("provider_payment_id"),
        "confirmation_url": confirmation_url,
        "status": attempt["status"],
        "provider": attempt.get("provider") or "yookassa",
        "purpose": "order",
    }


def _topup_response(attempt) -> dict:
    confirmation_url = attempt.get("confirmation_url")
    if attempt.get("processed_at") is not None and not confirmation_url:
        confirmation_url = YOOKASSA_BALANCE_RETURN_URL
    return {
        "top_up_id": attempt["id"],
        "attempt_id": attempt["id"],
        "payment_id": attempt.get("provider_payment_id"),
        "confirmation_url": confirmation_url,
        "status": attempt["status"],
        "provider": attempt.get("provider") or "yookassa",
        "purpose": "balance_topup",
    }


def _validate_idempotent_attempt(
    attempt,
    *,
    service_id: int,
    platform: str,
    quantity: int,
    recipient_link: str,
    amount: Decimal,
) -> None:
    expected = (
        service_id,
        platform,
        quantity,
        recipient_link,
        _money(amount),
    )
    actual = (
        attempt.get("order_service_id"),
        attempt.get("order_platform"),
        attempt.get("order_quantity"),
        attempt.get("order_link"),
        _money(attempt.get("order_amount")),
    )
    if actual != expected:
        raise PaymentConflictError(
            "Этот idempotence_key уже использован для другого заказа"
        )


def _create_or_get_attempt(
    *,
    user_id: int,
    service_id: int,
    platform: str,
    quantity: int,
    recipient_link: str,
    amount: Decimal,
    idempotence_key: str,
    provider: str = "yookassa",
):
    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_idempotence_key(
                session,
                user_id=user_id,
                idempotence_key=idempotence_key,
                provider=provider,
            )
            if attempt is not None:
                _validate_idempotent_attempt(
                    attempt,
                    service_id=service_id,
                    platform=platform,
                    quantity=quantity,
                    recipient_link=recipient_link,
                    amount=amount,
                )
                return attempt

            _, attempt = create_order_with_payment_attempt(
                session,
                user_id=user_id,
                service_id=service_id,
                platform=platform,
                recipient_link=recipient_link,
                quantity=quantity,
                amount=amount,
                created_at=_legacy_now(),
                idempotence_key=idempotence_key,
                provider=provider,
            )
            return attempt
    except IntegrityError:
        session.rollback()
        attempt = get_attempt_by_idempotence_key(
            session,
            user_id=user_id,
            idempotence_key=idempotence_key,
            provider=provider,
        )
        if attempt is None:
            raise
        _validate_idempotent_attempt(
            attempt,
            service_id=service_id,
            platform=platform,
            quantity=quantity,
            recipient_link=recipient_link,
            amount=amount,
        )
        return attempt
    finally:
        session.close()


def _prepare_order_attempt(
    *,
    user_id: int,
    service_id: str | int,
    quantity: int,
    recipient_link: str,
    idempotence_key: str,
    provider: str,
):
    service = get_service_by_id(service_id)
    if service is None:
        raise ServiceNotFoundError("Выбранная услуга больше недоступна")

    validate_service_quantity(service, quantity)
    amount = calculate_order_amount(service, quantity)
    if amount <= 0:
        raise ValueError("Стоимость заказа должна быть больше нуля")

    raw_service_id = service.get("id", service.get("service", service_id))
    try:
        persisted_service_id = int(raw_service_id)
    except (TypeError, ValueError) as error:
        raise ServiceNotFoundError("Поставщик вернул некорректный ID услуги") from error

    platform = str(service.get("platform") or service.get("soc") or "").lower()
    # The legacy orders.soc column is limited to 9 characters.
    platform = {"apple_music": "apple"}.get(platform, platform)
    if not platform or len(platform) > 9:
        raise ServiceNotFoundError("У услуги некорректно указана площадка")

    return _create_or_get_attempt(
        user_id=user_id,
        service_id=persisted_service_id,
        platform=platform,
        quantity=quantity,
        recipient_link=recipient_link,
        amount=amount,
        idempotence_key=idempotence_key,
        provider=provider,
    )


def create_order_payment(
    *,
    user_id: int,
    service_id: str | int,
    quantity: int,
    recipient_link: str,
    payment_method: str,
    idempotence_key: str,
) -> dict:
    if payment_method != "sbp":
        raise ValueError("Неподдерживаемый способ оплаты")

    attempt = _prepare_order_attempt(
        user_id=user_id,
        service_id=service_id,
        quantity=quantity,
        recipient_link=recipient_link,
        idempotence_key=idempotence_key,
        provider="yookassa",
    )

    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _payment_response(attempt)
    if attempt.get("processed_at") is not None:
        return _payment_response(attempt)

    payment = None
    try:
        payment = create_yookassa_payment(
            attempt_id=attempt["id"],
            order_id=attempt["order_id"],
            user_id=attempt["user_id"],
            amount=_money(attempt["amount"]),
            idempotence_key=idempotence_key,
        )
        actual_payment_method = _payment_method_type(payment)
        if actual_payment_method != "sbp":
            raise PaymentVerificationError(
                "ЮKassa создала способ оплаты "
                f"{actual_payment_method or 'unknown'} вместо СБП"
            )
        confirmation_url = _confirmation_url(payment)
        payment_status = str(getattr(payment, "status", "pending"))

        if not getattr(payment, "id", None):
            raise PaymentVerificationError("ЮKassa не вернула ID платежа")
        if payment_status not in {"succeeded", "canceled"} and not confirmation_url:
            raise PaymentVerificationError("ЮKassa не вернула ссылку подтверждения")

        session = SessionLocal()
        try:
            with session.begin():
                saved_attempt = set_attempt_payment_details(
                    session,
                    attempt_id=attempt["id"],
                    payment_id=str(payment.id),
                    payment_status=payment_status,
                    confirmation_url=confirmation_url,
                )
                if saved_attempt is None:
                    raise PaymentConflictError("Платёж уже связан с другим ID")
        finally:
            session.close()

        logger.info(
            "YooKassa payment created order_id=%s payment_id=%s",
            attempt["order_id"],
            payment.id,
        )

        if payment_status == "succeeded":
            order_id = process_verified_payment(payment)
            if order_id is not None:
                dispatch_order(order_id)
            saved_attempt = {
                **dict(saved_attempt),
                "status": "processed",
                "processed_at": datetime.now(MOSCOW_TIMEZONE),
            }

        return _payment_response(saved_attempt)
    except Exception as error:
        session = SessionLocal()
        try:
            with session.begin():
                payment_id = str(getattr(payment, "id", "")) if payment else ""
                if payment_id and _payment_method_type(payment) == "sbp":
                    set_attempt_payment_details(
                        session,
                        attempt_id=attempt["id"],
                        payment_id=payment_id,
                        payment_status=str(getattr(payment, "status", "pending")),
                        confirmation_url=_confirmation_url(payment),
                    )
                set_attempt_error(
                    session,
                    attempt_id=attempt["id"],
                    status="verification_failed" if payment_id else "creation_failed",
                    error_message=f"{type(error).__name__}: {error}",
                )
        finally:
            session.close()
        raise


async def create_crystalpay_order_payment(
    *,
    user_id: int,
    service_id: str | int,
    quantity: int,
    recipient_link: str,
    idempotence_key: str,
) -> dict:
    validate_crystalpay_configuration(require_salt=True)
    attempt = _prepare_order_attempt(
        user_id=user_id,
        service_id=service_id,
        quantity=quantity,
        recipient_link=recipient_link,
        idempotence_key=idempotence_key,
        provider="crystalpay",
    )
    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _payment_response(attempt)
    if attempt.get("processed_at") is not None:
        return _payment_response(attempt)

    invoice = None
    try:
        logger.info(
            "Creating CrystalPAY order invoice order_id=%s internal_payment_id=%s",
            attempt["order_id"],
            attempt["id"],
        )
        invoice = await crystalpay_client.create_invoice(
            amount=_money(attempt["amount"]),
            extra=str(attempt["id"]),
            invoice_type="purchase",
            description=f"Оплата заказа KingPromotion #{attempt['order_id']}",
            redirect_url=CRYSTALPAY_ORDER_REDIRECT_URL,
        )
        invoice_id = str(invoice.get("id") or "").strip()
        checkout_url = str(invoice.get("url") or "").strip()
        if not invoice_id:
            raise PaymentVerificationError("CrystalPAY не вернул ID инвойса")
        if not checkout_url:
            raise PaymentVerificationError("CrystalPAY не вернул ссылку на оплату")
        parsed_checkout_url = urlparse(checkout_url)
        if parsed_checkout_url.scheme != "https" or parsed_checkout_url.hostname != "pay.crystalpay.io":
            raise PaymentVerificationError("CrystalPAY вернул некорректную ссылку на оплату")
        if str(invoice.get("type") or "") != "purchase":
            raise PaymentVerificationError("CrystalPAY вернул некорректный тип инвойса")
        if str(invoice.get("currency") or "").upper() != "RUB":
            raise PaymentVerificationError("CrystalPAY вернул некорректную валюту инвойса")
        if _money(invoice.get("amount")) != _money(attempt["amount"]):
            raise PaymentVerificationError("CrystalPAY вернул некорректную сумму инвойса")

        session = SessionLocal()
        try:
            with session.begin():
                saved_attempt = set_attempt_payment_details(
                    session,
                    attempt_id=attempt["id"],
                    payment_id=invoice_id,
                    payment_status="created",
                    confirmation_url=checkout_url,
                )
                if saved_attempt is None:
                    raise PaymentConflictError("Платёж уже связан с другим ID")
        finally:
            session.close()
        return _payment_response(saved_attempt)
    except Exception as error:
        # Провалившаяся попытка не удерживает id и ссылку инвойса: иначе повторный
        # клик вернул бы ссылку на отклонённый платёж и спрятал саму ошибку.
        invoice_id = str((invoice or {}).get("id") or "")
        session = SessionLocal()
        try:
            with session.begin():
                set_attempt_error(
                    session,
                    attempt_id=attempt["id"],
                    status="creation_failed",
                    error_message=f"{type(error).__name__}: {error}",
                )
        finally:
            session.close()
        if invoice_id:
            logger.warning(
                "CrystalPAY order invoice rejected internal_payment_id=%s invoice_id=%s error=%s",
                attempt["id"],
                invoice_id,
                f"{type(error).__name__}: {error}",
            )
        raise


def _validate_idempotent_topup(attempt, *, user_id: int, amount: Decimal) -> None:
    if (
        (attempt.get("purpose") or "order") != "balance_topup"
        or attempt.get("user_id") != user_id
        or _money(attempt.get("amount")) != amount
    ):
        raise PaymentConflictError(
            "Этот idempotence_key уже использован для другого платежа"
        )


def _create_or_get_topup_attempt(
    *,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
    provider: str = "yookassa",
):
    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_idempotence_key(
                session,
                user_id=user_id,
                idempotence_key=idempotence_key,
                provider=provider,
            )
            if attempt is not None:
                _validate_idempotent_topup(
                    attempt,
                    user_id=user_id,
                    amount=amount,
                )
                return attempt
            return create_balance_topup_attempt(
                session,
                user_id=user_id,
                amount=amount,
                idempotence_key=idempotence_key,
                provider=provider,
            )
    except IntegrityError:
        session.rollback()
        attempt = get_attempt_by_idempotence_key(
            session,
            user_id=user_id,
            idempotence_key=idempotence_key,
            provider=provider,
        )
        if attempt is None:
            raise
        _validate_idempotent_topup(
            attempt,
            user_id=user_id,
            amount=amount,
        )
        return attempt
    finally:
        session.close()


def create_balance_topup_payment(
    *,
    user_id: int,
    amount: Decimal,
    payment_method: str,
    idempotence_key: str,
) -> dict:
    if payment_method != "sbp":
        raise ValueError("Неподдерживаемый способ оплаты")
    amount = _money(amount)
    if amount < Decimal("10.00") or amount > Decimal("100000.00"):
        raise ValueError("Сумма пополнения должна быть от 10 до 100 000 рублей")

    attempt = _create_or_get_topup_attempt(
        user_id=user_id,
        amount=amount,
        idempotence_key=idempotence_key,
    )
    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _topup_response(attempt)
    if attempt.get("processed_at") is not None:
        return _topup_response(attempt)

    payment = None
    try:
        payment = create_yookassa_payment(
            attempt_id=attempt["id"],
            order_id=None,
            user_id=attempt["user_id"],
            amount=amount,
            idempotence_key=idempotence_key,
            purpose="balance_topup",
        )
        actual_payment_method = _payment_method_type(payment)
        if actual_payment_method != "sbp":
            raise PaymentVerificationError(
                "ЮKassa создала неподдерживаемый способ оплаты"
            )
        confirmation_url = _confirmation_url(payment)
        payment_status = str(getattr(payment, "status", "pending"))
        if not getattr(payment, "id", None):
            raise PaymentVerificationError("ЮKassa не вернула ID платежа")
        if payment_status not in {"succeeded", "canceled"} and not confirmation_url:
            raise PaymentVerificationError("ЮKassa не вернула ссылку подтверждения")

        session = SessionLocal()
        try:
            with session.begin():
                saved_attempt = set_attempt_payment_details(
                    session,
                    attempt_id=attempt["id"],
                    payment_id=str(payment.id),
                    payment_status=payment_status,
                    confirmation_url=confirmation_url,
                )
                if saved_attempt is None:
                    raise PaymentConflictError("Платёж уже связан с другим ID")
        finally:
            session.close()

        if payment_status == "succeeded":
            process_verified_payment(payment)
            saved_attempt = {
                **dict(saved_attempt),
                "status": "processed",
                "processed_at": datetime.now(MOSCOW_TIMEZONE),
            }
        return _topup_response(saved_attempt)
    except Exception as error:
        session = SessionLocal()
        try:
            with session.begin():
                payment_id = str(getattr(payment, "id", "")) if payment else ""
                if payment_id and _payment_method_type(payment) == "sbp":
                    set_attempt_payment_details(
                        session,
                        attempt_id=attempt["id"],
                        payment_id=payment_id,
                        payment_status=str(getattr(payment, "status", "pending")),
                        confirmation_url=_confirmation_url(payment),
                    )
                set_attempt_error(
                    session,
                    attempt_id=attempt["id"],
                    status="verification_failed" if payment_id else "creation_failed",
                    error_message=f"{type(error).__name__}: {error}",
                )
        finally:
            session.close()
        raise


async def create_crystalpay_topup(
    *,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
) -> dict:
    validate_crystalpay_configuration(require_salt=True)
    amount = _money(amount)
    if amount < Decimal("10.00") or amount > Decimal("100000.00"):
        raise ValueError("Сумма пополнения должна быть от 10 до 100 000 рублей")

    attempt = _create_or_get_topup_attempt(
        user_id=user_id,
        amount=amount,
        idempotence_key=idempotence_key,
        provider="crystalpay",
    )
    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _topup_response(attempt)

    invoice = None
    try:
        logger.info("Creating CrystalPAY invoice internal_payment_id=%s", attempt["id"])
        invoice = await crystalpay_client.create_invoice(
            amount=amount,
            extra=str(attempt["id"]),
        )
        invoice_id = str(invoice.get("id") or "").strip()
        checkout_url = str(invoice.get("url") or "").strip()
        if not invoice_id:
            raise PaymentVerificationError("CrystalPAY не вернул ID инвойса")
        if not checkout_url:
            raise PaymentVerificationError("CrystalPAY не вернул ссылку на оплату")
        parsed_checkout_url = urlparse(checkout_url)
        if parsed_checkout_url.scheme != "https" or parsed_checkout_url.hostname != "pay.crystalpay.io":
            raise PaymentVerificationError("CrystalPAY вернул некорректную ссылку на оплату")
        if str(invoice.get("type") or "") != "topup":
            raise PaymentVerificationError("CrystalPAY вернул некорректный тип инвойса")
        if str(invoice.get("currency") or "").upper() != "RUB":
            raise PaymentVerificationError("CrystalPAY вернул некорректную валюту инвойса")

        session = SessionLocal()
        try:
            with session.begin():
                saved_attempt = set_attempt_payment_details(
                    session,
                    attempt_id=attempt["id"],
                    payment_id=invoice_id,
                    payment_status="created",
                    confirmation_url=checkout_url,
                )
                if saved_attempt is None:
                    raise PaymentConflictError("Платёж уже связан с другим ID")
        finally:
            session.close()

        logger.info(
            "CrystalPAY invoice created internal_payment_id=%s invoice_id=%s",
            attempt["id"],
            invoice_id,
        )
        return _topup_response(saved_attempt)
    except Exception as error:
        # Провалившаяся попытка не удерживает id и ссылку инвойса: иначе повторный
        # клик вернул бы ссылку на отклонённый платёж и спрятал саму ошибку.
        invoice_id = str((invoice or {}).get("id") or "")
        session = SessionLocal()
        try:
            with session.begin():
                set_attempt_error(
                    session,
                    attempt_id=attempt["id"],
                    status="creation_failed",
                    error_message=f"{type(error).__name__}: {error}",
                )
        finally:
            session.close()
        logger.warning(
            "CrystalPAY invoice creation failed internal_payment_id=%s invoice_id=%s error=%s",
            attempt["id"],
            invoice_id or None,
            f"{type(error).__name__}: {error}",
        )
        raise


# ------------------------------- Heleket -----------------------------------

_HELEKET_SUCCESS_STATUSES = {"paid", "paid_over"}
# Промежуточные статусы не зачисляют баланс — только обновляют локальный статус.
_HELEKET_LOCAL_STATUS = {
    "wrong_amount": "wrongamount",
    "wrong_amount_waiting": "pending",
    "process": "pending",
    "confirm_check": "pending",
    "check": "pending",
    "refund_process": "pending",
    "refund_fail": "pending",
    "locked": "locked",
}


def _heleket_local_status(status: str) -> str:
    value = str(status or "").lower()
    if value in {"fail", "system_fail"}:
        return "failed"
    if value in {"cancel", "refund_paid"}:
        return "canceled"
    return _HELEKET_LOCAL_STATUS.get(value, "pending")


def _heleket_validate_invoice(
    invoice,
    *,
    provider_order_id: str,
    amount: Decimal,
) -> tuple[str, str]:
    """Проверяет ответ Heleket и возвращает (UUID инвойса, ссылку на оплату)."""
    invoice_uuid = str(getattr(invoice, "uuid", "") or "").strip()
    checkout_url = str(getattr(invoice, "url", "") or "").strip()
    if not invoice_uuid:
        raise PaymentVerificationError("Heleket не вернул UUID инвойса")
    if not checkout_url:
        raise PaymentVerificationError("Heleket не вернул ссылку на оплату")
    if urlparse(checkout_url).scheme != "https":
        raise PaymentVerificationError("Heleket вернул некорректную ссылку на оплату")
    invoice_order_id = str(getattr(invoice, "order_id", "") or "")
    if invoice_order_id and invoice_order_id != provider_order_id:
        raise PaymentVerificationError("Heleket вернул чужой order_id")
    invoice_amount = getattr(invoice, "amount", None)
    if invoice_amount and _money(invoice_amount) != amount:
        raise PaymentVerificationError("Heleket вернул некорректную сумму инвойса")
    return invoice_uuid, checkout_url


def _heleket_create_invoice_for_attempt(attempt, *, amount: Decimal):
    """Создаёт счёт Heleket и сохраняет его данные в локальной попытке."""
    provider_order_id = attempt.get("provider_order_id") or (
        f"hk_{attempt['user_id']}_{uuid.uuid4().hex}"
    )
    try:
        logger.info(
            "Creating Heleket invoice order_id=%s internal_payment_id=%s purpose=%s",
            provider_order_id,
            attempt["id"],
            attempt.get("purpose"),
        )
        invoice = create_heleket_invoice(
            amount=format(amount, ".2f"),
            order_id=provider_order_id,
        )
        invoice_uuid, checkout_url = _heleket_validate_invoice(
            invoice,
            provider_order_id=provider_order_id,
            amount=amount,
        )

        session = SessionLocal()
        try:
            with session.begin():
                saved_attempt = set_attempt_heleket_details(
                    session,
                    attempt_id=attempt["id"],
                    provider_order_id=provider_order_id,
                    payment_id=invoice_uuid,
                    payment_status="pending",
                    confirmation_url=checkout_url,
                )
                if saved_attempt is None:
                    raise PaymentConflictError("Платёж уже связан с другим инвойсом")
        finally:
            session.close()

        logger.info(
            "Heleket invoice created order_id=%s uuid=%s",
            provider_order_id,
            invoice_uuid,
        )
        return saved_attempt
    except Exception as error:
        # Провалившаяся попытка не удерживает UUID и ссылку инвойса:
        # повторный клик создаст новый счёт у провайдера.
        session = SessionLocal()
        try:
            with session.begin():
                set_attempt_error(
                    session,
                    attempt_id=attempt["id"],
                    status="creation_failed",
                    error_message=f"{type(error).__name__}: {error}",
                )
        finally:
            session.close()
        logger.warning(
            "Heleket invoice creation failed order_id=%s internal_payment_id=%s error=%s",
            provider_order_id,
            attempt["id"],
            f"{type(error).__name__}: {error}",
        )
        raise


def create_heleket_topup(
    *,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
) -> dict:
    """Создаёт пополнение баланса через Heleket.

    order_id генерируется только на backend; перед запросом к провайдеру
    в PostgreSQL уже лежит локальная попытка с зафиксированной суммой.
    """
    validate_heleket_configuration()
    amount = _money(amount)
    if amount < Decimal("10.00") or amount > Decimal("100000.00"):
        raise ValueError("Сумма пополнения должна быть от 10 до 100 000 рублей")

    attempt = _create_or_get_topup_attempt(
        user_id=user_id,
        amount=amount,
        idempotence_key=idempotence_key,
        provider="heleket",
    )
    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _topup_response(attempt)
    if attempt.get("processed_at") is not None:
        return _topup_response(attempt)

    return _topup_response(
        _heleket_create_invoice_for_attempt(attempt, amount=amount)
    )


def create_heleket_order_payment(
    *,
    user_id: int,
    service_id: str | int,
    quantity: int,
    recipient_link: str,
    idempotence_key: str,
) -> dict:
    """Оплата заказа криптовалютой через Heleket."""
    validate_heleket_configuration()
    attempt = _prepare_order_attempt(
        user_id=user_id,
        service_id=service_id,
        quantity=quantity,
        recipient_link=recipient_link,
        idempotence_key=idempotence_key,
        provider="heleket",
    )
    if attempt.get("provider_payment_id") and attempt.get("confirmation_url"):
        return _payment_response(attempt)
    if attempt.get("processed_at") is not None:
        return _payment_response(attempt)

    return _payment_response(
        _heleket_create_invoice_for_attempt(
            attempt,
            amount=_money(attempt["amount"]),
        )
    )


def process_heleket_webhook_payload(payload: dict) -> bool:
    """Обрабатывает проверенный webhook Heleket.

    Баланс зачисляется только по статусам paid/paid_over, только один раз
    (FOR UPDATE + processed_at) и только на зафиксированную ЛОКАЛЬНУЮ сумму —
    payment_amount из webhook не используется, т.к. валюта платежа может
    отличаться от валюты сайта.
    """
    provider_order_id = str(payload.get("order_id") or "")
    invoice_uuid = str(payload.get("uuid") or "")
    status = str(payload.get("status") or "").lower()
    if not provider_order_id or not invoice_uuid:
        raise PaymentVerificationError("Webhook Heleket без идентификаторов платежа")

    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_provider_order_id(
                session,
                provider_order_id,
                for_update=True,
                provider="heleket",
            )
            if attempt is None:
                raise PaymentVerificationError("Платёж Heleket не найден")
            # Heleket обслуживает и пополнение баланса, и прямую оплату заказа.
            attempt_purpose = attempt.get("purpose") or "order"
            if attempt_purpose == "balance_topup" and attempt.get("order_id") is not None:
                raise PaymentVerificationError("У пополнения баланса не должно быть заказа")
            if attempt_purpose == "order" and attempt.get("order_id") is None:
                raise PaymentVerificationError("У платежа заказа нет связанного заказа")
            if str(attempt.get("provider_payment_id") or "") != invoice_uuid:
                raise PaymentVerificationError("UUID инвойса Heleket не совпадает")

            if attempt.get("processed_at") is not None:
                logger.info(
                    "Duplicate Heleket webhook ignored order_id=%s uuid=%s status=%s",
                    provider_order_id,
                    invoice_uuid,
                    status,
                )
                return False
            if attempt.get("status") in {"cancel_requested", "canceled", "paid_after_cancel"}:
                if status in _HELEKET_SUCCESS_STATUSES:
                    mark_payment_paid_after_cancel(session, attempt["id"])
                return False

            if status not in _HELEKET_SUCCESS_STATUSES:
                set_attempt_status(
                    session,
                    attempt_id=attempt["id"],
                    status=_heleket_local_status(status),
                )
                logger.info(
                    "Heleket payment not credited order_id=%s uuid=%s status=%s",
                    provider_order_id,
                    invoice_uuid,
                    status,
                )
                return False

            payment_amount = _money(attempt["amount"])
            user = lock_user(session, attempt["user_id"])
            if user is None:
                raise PaymentVerificationError("Пользователь платежа не найден")

            # Для заказа сначала блокируем его строку и проверяем её состояние.
            order = None
            if attempt_purpose == "order":
                order = lock_order(session, attempt["order_id"])
                if order is None:
                    raise PaymentVerificationError("Заказ не найден")
                if order["user_id"] != attempt["user_id"]:
                    raise PaymentVerificationError("Заказ принадлежит другому пользователю")
                if _money(order["amount"]) != payment_amount:
                    raise PaymentVerificationError("Стоимость заказа изменилась")
                if order["status"] not in {"Ожидает оплаты", "Оплата отменена"}:
                    raise PaymentConflictError(
                        f"Заказ нельзя оплатить в статусе {order['status']}"
                    )

            balance_before = _money(user["balance"])
            balance_after_credit = balance_before + payment_amount
            operation_date = _legacy_now()
            transaction_id = create_balance_transaction(
                session,
                user_id=attempt["user_id"],
                amount=payment_amount,
                balance_before=balance_before,
                date=operation_date,
                external_id=invoice_uuid,
                provider="heleket",
            )
            create_expense(
                session,
                user_id=attempt["user_id"],
                related_id=transaction_id,
                balance_before=balance_before,
                balance_after=balance_after_credit,
                amount=payment_amount,
                date=operation_date,
                expense_type=2,
            )
            referral_percent = _money(REFERRAL_REWARD_PERCENT)
            if referral_percent < 0 or referral_percent > 100:
                raise RuntimeError("Некорректный REFERRAL_REWARD_PERCENT")
            referral_reward = (
                payment_amount * referral_percent / Decimal("100")
            ).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
            add_referral_reward(
                session,
                user_id=attempt["user_id"],
                reward=referral_reward,
            )

            if order is None:
                set_user_balance(
                    session,
                    user_id=attempt["user_id"],
                    balance=balance_after_credit,
                )
                mark_payment_processed(
                    session,
                    attempt_id=attempt["id"],
                    transaction_id=transaction_id,
                    credited_amount=payment_amount,
                )
                logger.info(
                    "Heleket balance credited order_id=%s uuid=%s amount=%s",
                    provider_order_id,
                    invoice_uuid,
                    payment_amount,
                )
                return True

            balance_after_order = balance_after_credit - payment_amount
            if balance_after_order < 0:
                raise PaymentVerificationError("Недостаточно средств после пополнения")
            create_expense(
                session,
                user_id=attempt["user_id"],
                related_id=order["id"],
                balance_before=balance_after_credit,
                balance_after=balance_after_order,
                amount=-payment_amount,
                date=operation_date,
                expense_type=0,
            )
            set_user_balance(
                session,
                user_id=attempt["user_id"],
                balance=balance_after_order,
            )
            mark_order_paid(session, order["id"])
            mark_payment_processed(
                session,
                attempt_id=attempt["id"],
                transaction_id=transaction_id,
                credited_amount=payment_amount,
            )
            logger.info(
                "Heleket order paid order_id=%s uuid=%s target_order=%s",
                provider_order_id,
                invoice_uuid,
                order["id"],
            )
            return order["id"]
    finally:
        session.close()


def reconcile_heleket_invoice_if_due(payment_id: str) -> None:
    """Проверяет статус инвойса у Heleket, если webhook задерживается."""
    session = SessionLocal()
    try:
        with session.begin():
            claimed = claim_payment_reconciliation(
                session,
                payment_id,
                provider="heleket",
            )
    finally:
        session.close()
    if not claimed:
        return

    try:
        invoice = get_heleket_invoice_by_uuid(payment_id)
        result = process_heleket_webhook_payload(invoice_to_payload(invoice))
        if type(result) is int:
            dispatch_order(result)
    except Exception as error:
        logger.warning(
            "Heleket reconciliation failed uuid=%s error=%s",
            payment_id,
            type(error).__name__,
        )


def _process_crystalpay_topup_invoice(invoice_id: str, invoice: dict) -> bool:
    verified_invoice_id = str(invoice.get("id") or "")
    if verified_invoice_id != invoice_id:
        raise PaymentVerificationError("ID инвойса CrystalPAY не совпадает")
    if str(invoice.get("type") or "") != "topup":
        raise PaymentVerificationError("Некорректный тип инвойса CrystalPAY")
    currency = str(invoice.get("currency") or "").upper()
    if currency != "RUB":
        raise PaymentVerificationError("Валюта инвойса CrystalPAY не совпадает")

    state = str(invoice.get("state") or "").lower()
    if not state:
        raise PaymentVerificationError("CrystalPAY не вернул статус инвойса")

    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_payment_id(
                session,
                invoice_id,
                for_update=True,
                provider="crystalpay",
            )
            if attempt is None:
                raise PaymentVerificationError("Инвойс CrystalPAY не найден")
            if str(invoice.get("extra") or "") != str(attempt["id"]):
                raise PaymentVerificationError("Связь инвойса CrystalPAY не совпадает")
            if attempt.get("purpose") != "balance_topup" or attempt.get("order_id") is not None:
                raise PaymentVerificationError("Инвойс не является пополнением баланса")
            if attempt.get("processed_at") is not None:
                logger.info(
                    "Duplicate CrystalPAY callback invoice_id=%s internal_payment_id=%s",
                    invoice_id,
                    attempt["id"],
                )
                return False
            if attempt.get("status") in {"cancel_requested", "canceled", "paid_after_cancel"}:
                if state == "payed":
                    mark_payment_paid_after_cancel(session, attempt["id"])
                return False
            if state != "payed":
                set_attempt_status(session, attempt_id=attempt["id"], status=state)
                logger.info(
                    "CrystalPAY invoice not credited invoice_id=%s state=%s",
                    invoice_id,
                    state,
                )
                return False

            actual_amount = _money(invoice.get("amount"))
            if actual_amount <= 0 or actual_amount > Decimal("99999999.99"):
                raise PaymentVerificationError("Некорректная оплаченная сумма CrystalPAY")
            user = lock_user(session, attempt["user_id"])
            if user is None:
                raise PaymentVerificationError("Пользователь платежа не найден")

            balance_before = _money(user["balance"])
            balance_after = balance_before + actual_amount
            operation_date = _legacy_now()
            transaction_id = create_balance_transaction(
                session,
                user_id=attempt["user_id"],
                amount=actual_amount,
                balance_before=balance_before,
                date=operation_date,
                external_id=invoice_id,
                provider="crystalpay",
            )
            create_expense(
                session,
                user_id=attempt["user_id"],
                related_id=transaction_id,
                balance_before=balance_before,
                balance_after=balance_after,
                amount=actual_amount,
                date=operation_date,
                expense_type=2,
            )
            referral_percent = _money(REFERRAL_REWARD_PERCENT)
            if referral_percent < 0 or referral_percent > 100:
                raise RuntimeError("Некорректный REFERRAL_REWARD_PERCENT")
            referral_reward = (
                actual_amount * referral_percent / Decimal("100")
            ).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
            add_referral_reward(
                session,
                user_id=attempt["user_id"],
                reward=referral_reward,
            )
            set_user_balance(
                session,
                user_id=attempt["user_id"],
                balance=balance_after,
            )
            mark_payment_processed(
                session,
                attempt_id=attempt["id"],
                transaction_id=transaction_id,
                credited_amount=actual_amount,
            )
            logger.info(
                "CrystalPAY balance credited internal_payment_id=%s invoice_id=%s amount=%s",
                attempt["id"],
                invoice_id,
                actual_amount,
            )
            return True
    finally:
        session.close()


def _process_crystalpay_order_invoice(invoice_id: str, invoice: dict) -> int | bool:
    if str(invoice.get('id') or '') != invoice_id:
        raise PaymentVerificationError('ID инвойса CrystalPAY не совпадает')
    if str(invoice.get('type') or '') != 'purchase':
        raise PaymentVerificationError('Некорректный тип инвойса CrystalPAY')
    currency = str(invoice.get('currency') or '').upper()
    if currency != 'RUB':
        raise PaymentVerificationError('Валюта инвойса CrystalPAY не совпадает')
    state = str(invoice.get('state') or '').lower()
    if not state:
        raise PaymentVerificationError('CrystalPAY не вернул статус инвойса')

    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_payment_id(
                session, invoice_id, for_update=True, provider='crystalpay',
            )
            if attempt is None:
                raise PaymentVerificationError('Инвойс CrystalPAY не найден')
            if str(invoice.get('extra') or '') != str(attempt['id']):
                raise PaymentVerificationError('Связь инвойса CrystalPAY не совпадает')
            if (attempt.get('purpose') or 'order') != 'order' or attempt.get('order_id') is None:
                raise PaymentVerificationError('Инвойс не является оплатой заказа')
            if attempt.get('processed_at') is not None:
                return False
            if attempt.get('status') in {'cancel_requested', 'canceled', 'paid_after_cancel'}:
                if state == 'payed':
                    mark_payment_paid_after_cancel(session, attempt['id'])
                return False
            if state != 'payed':
                set_attempt_status(session, attempt_id=attempt['id'], status=state)
                return False

            payment_amount = _money(invoice.get('amount'))
            if payment_amount != _money(attempt['amount']):
                raise PaymentVerificationError('Сумма платежа CrystalPAY не совпадает')
            user = lock_user(session, attempt['user_id'])
            order = lock_order(session, attempt['order_id'])
            if user is None or order is None:
                raise PaymentVerificationError('Пользователь или заказ не найден')
            if order['user_id'] != attempt['user_id']:
                raise PaymentVerificationError('Заказ принадлежит другому пользователю')
            if _money(order['amount']) != payment_amount:
                raise PaymentVerificationError('Стоимость заказа изменилась')
            if order['status'] not in {'Ожидает оплаты', 'Оплата отменена'}:
                raise PaymentConflictError(f"Заказ нельзя оплатить в статусе {order['status']}")

            balance_before = _money(user['balance'])
            balance_after_credit = balance_before + payment_amount
            operation_date = _legacy_now()
            transaction_id = create_balance_transaction(
                session, user_id=attempt['user_id'], amount=payment_amount,
                balance_before=balance_before, date=operation_date,
                external_id=invoice_id, provider='crystalpay',
            )
            create_expense(
                session, user_id=attempt['user_id'], related_id=transaction_id,
                balance_before=balance_before, balance_after=balance_after_credit,
                amount=payment_amount, date=operation_date, expense_type=2,
            )
            referral_percent = _money(REFERRAL_REWARD_PERCENT)
            referral_reward = (payment_amount * referral_percent / Decimal('100')).quantize(
                MONEY_STEP, rounding=ROUND_HALF_UP,
            )
            add_referral_reward(session, user_id=attempt['user_id'], reward=referral_reward)
            balance_after_order = balance_after_credit - _money(order['amount'])
            create_expense(
                session, user_id=attempt['user_id'], related_id=order['id'],
                balance_before=balance_after_credit, balance_after=balance_after_order,
                amount=-_money(order['amount']), date=operation_date, expense_type=0,
            )
            set_user_balance(session, user_id=attempt['user_id'], balance=balance_after_order)
            mark_order_paid(session, order['id'])
            mark_payment_processed(session, attempt_id=attempt['id'], transaction_id=transaction_id)
            return order['id']
    finally:
        session.close()


def process_crystalpay_invoice(invoice_id: str, invoice: dict) -> bool | int:
    invoice_type = str(invoice.get('type') or '')
    if invoice_type == 'topup':
        return _process_crystalpay_topup_invoice(invoice_id, invoice)
    if invoice_type == 'purchase':
        return _process_crystalpay_order_invoice(invoice_id, invoice)
    raise PaymentVerificationError('Неподдерживаемый тип инвойса CrystalPAY')


async def reconcile_crystalpay_invoice_if_due(invoice_id: str) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            claimed = claim_payment_reconciliation(
                session,
                invoice_id,
                provider="crystalpay",
            )
    finally:
        session.close()
    if not claimed:
        return

    try:
        invoice = await crystalpay_client.get_invoice(invoice_id)
        result = process_crystalpay_invoice(invoice_id, invoice)
        if type(result) is int:
            dispatch_order(result)
    except Exception as error:
        logger.warning(
            "CrystalPAY reconciliation failed invoice_id=%s error=%s",
            invoice_id,
            type(error).__name__,
        )


async def _confirm_provider_payment(attempt) -> bool:
    """Сверяет просроченную попытку с провайдером перед отменой.

    Оплаченный платёж обрабатывается обычным путём: колбэк мог задержаться,
    и отменять уже оплаченный заказ нельзя.
    @returns True, если платёж оплачен и обработан; иначе False.
    """
    payment_id = attempt.get("provider_payment_id")
    if not payment_id:
        return False
    provider = attempt.get("provider") or "yookassa"
    if provider == "heleket":
        invoice = await asyncio.to_thread(get_heleket_invoice_by_uuid, payment_id)
        payload = invoice_to_payload(invoice)
        if payload.get("status") not in _HELEKET_SUCCESS_STATUSES:
            return False
        result = await asyncio.to_thread(process_heleket_webhook_payload, payload)
        if type(result) is int:
            dispatch_order(result)
        return True
    if provider == "crystalpay":
        invoice = await crystalpay_client.get_invoice(payment_id)
        if str(invoice.get("state") or "").lower() != "payed":
            return False
        result = process_crystalpay_invoice(payment_id, invoice)
        if type(result) is int:
            dispatch_order(result)
        return True

    payment = get_yookassa_payment(payment_id)
    status = str(getattr(payment, "status", ""))
    if status == "succeeded":
        result = process_verified_payment(payment)
        if type(result) is int:
            dispatch_order(result)
        return True
    if status in {"pending", "waiting_for_capture"}:
        # Закрываем платёж у провайдера, чтобы по ссылке больше нельзя было заплатить.
        cancel_yookassa_payment(payment_id, f"expire-{attempt['id']}")
    return False


async def expire_stale_payments(*, timeout_minutes: int | None = None) -> dict[str, int]:
    """Отменяет платежи, не оплаченные в течение окна оплаты.

    Сначала попытка сверяется с провайдером: если деньги всё-таки пришли, платёж
    зачисляется. Иначе попытка помечается истёкшей, а заказ снимается с ожидания
    оплаты и во вкладке «Мои заказы» показывается как отменённый.
    @param timeout_minutes - окно оплаты; по умолчанию берётся из настроек.
    @returns счётчики проверенных, зачисленных, отменённых и непроверенных попыток.
    """
    window = PAYMENT_TIMEOUT_MINUTES if timeout_minutes is None else timeout_minutes

    session = SessionLocal()
    try:
        candidates = list_expired_unpaid_attempts(session, timeout_minutes=window)
    finally:
        session.close()

    credited = 0
    expired = 0
    unverified = 0
    for attempt in candidates:
        try:
            if await _confirm_provider_payment(attempt):
                credited += 1
                continue
        except Exception as error:
            # Провайдер недоступен: счёт у него всё равно не живёт дольше окна
            # оплаты, поэтому попытку закрываем, а поздний успех обработает колбэк.
            unverified += 1
            logger.warning(
                "payment expiry precheck failed attempt_id=%s provider=%s error=%s",
                attempt["id"],
                attempt.get("provider"),
                f"{type(error).__name__}: {error}",
            )

        session = SessionLocal()
        try:
            with session.begin():
                if expire_payment_attempt(
                    session,
                    attempt_id=attempt["id"],
                    order_id=attempt.get("order_id"),
                ):
                    expired += 1
        finally:
            session.close()

    if candidates:
        logger.info(
            "payment expiry sweep checked=%s credited=%s expired=%s unverified=%s",
            len(candidates),
            credited,
            expired,
            unverified,
        )
    return {
        "checked": len(candidates),
        "credited": credited,
        "expired": expired,
        "unverified": unverified,
    }


def _validate_payment(payment, attempt) -> Decimal:
    metadata = getattr(payment, "metadata", {}) or {}
    if str(metadata.get("payment_attempt_id")) != str(attempt["id"]):
        raise PaymentVerificationError("payment_attempt_id платежа не совпадает")
    attempt_purpose = attempt.get("purpose") or "order"
    payment_purpose = str(metadata.get("purpose") or "order")
    if payment_purpose != attempt_purpose:
        raise PaymentVerificationError("Назначение платежа не совпадает")
    if attempt_purpose == "order" and str(metadata.get("order_id")) != str(attempt["order_id"]):
        raise PaymentVerificationError("order_id платежа не совпадает")
    if attempt_purpose == "balance_topup" and metadata.get("order_id") not in {None, ""}:
        raise PaymentVerificationError("У пополнения не должно быть order_id")
    if str(metadata.get("user_id")) != str(attempt["user_id"]):
        raise PaymentVerificationError("user_id платежа не совпадает")

    payment_amount = _money(getattr(getattr(payment, "amount", None), "value", None))
    if payment_amount != _money(attempt["amount"]):
        raise PaymentVerificationError("Сумма платежа не совпадает")

    currency = str(getattr(getattr(payment, "amount", None), "currency", ""))
    if currency.upper() != str(attempt["currency"]).upper():
        raise PaymentVerificationError("Валюта платежа не совпадает")
    return payment_amount


def process_verified_payment(payment) -> int | None:
    payment_id = str(getattr(payment, "id", ""))
    if not payment_id:
        raise PaymentVerificationError("ЮKassa не вернула ID платежа")

    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_payment_id(
                session,
                payment_id,
                for_update=True,
            )
            if attempt is None:
                raise PaymentVerificationError("Попытка платежа не найдена")

            payment_amount = _validate_payment(payment, attempt)
            payment_status = str(getattr(payment, "status", ""))

            if attempt["processed_at"] is not None:
                return None

            if payment_status == "canceled":
                mark_payment_canceled(
                    session,
                    attempt_id=attempt["id"],
                    order_id=attempt["order_id"],
                )
                return None
            if payment_status != "succeeded":
                set_attempt_payment_details(
                    session,
                    attempt_id=attempt["id"],
                    payment_id=payment_id,
                    payment_status=payment_status or "pending",
                    confirmation_url=_confirmation_url(payment),
                )
                return None

            attempt_purpose = attempt.get("purpose") or "order"
            if attempt_purpose == "balance_topup":
                user = lock_user(session, attempt["user_id"])
                if user is None:
                    raise PaymentVerificationError("Пользователь не найден")
                balance_before = _money(user["balance"])
                balance_after = balance_before + payment_amount
                operation_date = _legacy_now()
                transaction_id = create_balance_transaction(
                    session,
                    user_id=attempt["user_id"],
                    amount=payment_amount,
                    balance_before=balance_before,
                    date=operation_date,
                    external_id=payment_id,
                )
                create_expense(
                    session,
                    user_id=attempt["user_id"],
                    related_id=transaction_id,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    amount=payment_amount,
                    date=operation_date,
                    expense_type=2,
                )
                referral_percent = _money(REFERRAL_REWARD_PERCENT)
                if referral_percent < 0 or referral_percent > 100:
                    raise RuntimeError("Некорректный REFERRAL_REWARD_PERCENT")
                referral_reward = (
                    payment_amount * referral_percent / Decimal("100")
                ).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
                add_referral_reward(
                    session,
                    user_id=attempt["user_id"],
                    reward=referral_reward,
                )
                set_user_balance(
                    session,
                    user_id=attempt["user_id"],
                    balance=balance_after,
                )
                mark_payment_processed(
                    session,
                    attempt_id=attempt["id"],
                    transaction_id=transaction_id,
                )
                return None

            user = lock_user(session, attempt["user_id"])
            order = lock_order(session, attempt["order_id"])
            if user is None or order is None:
                raise PaymentVerificationError("Пользователь или заказ не найден")
            if order["user_id"] != attempt["user_id"]:
                raise PaymentVerificationError("Заказ принадлежит другому пользователю")
            if _money(order["amount"]) != payment_amount:
                raise PaymentVerificationError("Стоимость заказа изменилась")
            if order["status"] not in {"Ожидает оплаты", "Оплата отменена"}:
                raise PaymentConflictError(
                    f"Заказ нельзя оплатить в статусе {order['status']}"
                )

            balance_before = _money(user["balance"])
            balance_after_credit = balance_before + payment_amount
            operation_date = _legacy_now()
            transaction_id = create_balance_transaction(
                session,
                user_id=attempt["user_id"],
                amount=payment_amount,
                balance_before=balance_before,
                date=operation_date,
                external_id=payment_id,
            )
            create_expense(
                session,
                user_id=attempt["user_id"],
                related_id=transaction_id,
                balance_before=balance_before,
                balance_after=balance_after_credit,
                amount=payment_amount,
                date=operation_date,
                expense_type=2,
            )

            referral_percent = _money(REFERRAL_REWARD_PERCENT)
            if referral_percent < 0 or referral_percent > 100:
                raise RuntimeError("Некорректный REFERRAL_REWARD_PERCENT")
            referral_reward = (
                payment_amount * referral_percent / Decimal("100")
            ).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)
            add_referral_reward(
                session,
                user_id=attempt["user_id"],
                reward=referral_reward,
            )

            order_amount = _money(order["amount"])
            balance_after_order = balance_after_credit - order_amount
            if balance_after_order < 0:
                raise PaymentVerificationError("Недостаточно средств после пополнения")
            create_expense(
                session,
                user_id=attempt["user_id"],
                related_id=order["id"],
                balance_before=balance_after_credit,
                balance_after=balance_after_order,
                amount=-order_amount,
                date=operation_date,
                expense_type=0,
            )
            set_user_balance(
                session,
                user_id=attempt["user_id"],
                balance=balance_after_order,
            )
            mark_order_paid(session, order["id"])
            mark_payment_processed(
                session,
                attempt_id=attempt["id"],
                transaction_id=transaction_id,
            )
            return order["id"]
    finally:
        session.close()


def verify_payment_notification(payment_id: str) -> int | None:
    payment = get_yookassa_payment(payment_id)
    return process_verified_payment(payment)


def reconcile_payment_if_due(payment_id: str) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            should_reconcile = claim_payment_reconciliation(session, payment_id)
    finally:
        session.close()
    if not should_reconcile:
        return

    try:
        order_id = verify_payment_notification(payment_id)
        if order_id is not None:
            dispatch_order(order_id)
    except Exception:
        logger.exception("Payment reconciliation failed")


def _save_dispatch_state(callback, **kwargs) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            callback(session, **kwargs)
    finally:
        session.close()


def _is_insufficient_funds_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(fragment in message for fragment in (
        "not enough funds",
        "insufficient funds",
        "insufficient balance",
        "недостаточно средств",
        "недостаточный баланс",
    ))


def dispatch_order(order_id: int) -> str:
    session = SessionLocal()
    try:
        with session.begin():
            order = claim_order_for_dispatch(session, order_id)
    finally:
        session.close()
    if order is None:
        return "not_dispatchable"

    try:
        service = get_service_by_id(order["service_id"])
        if service is None:
            _save_dispatch_state(
                mark_dispatch_rejected,
                order_id=order_id,
                error_message="Услуга поставщика больше недоступна",
            )
            return "rejected"

        supplier_cost = calculate_supplier_order_cost(service, order["qnt"])
        service_currency = str(service.get("currency") or "RUB").upper()
        supplier_balance = get_supplier_balance()
        if supplier_balance.currency != service_currency:
            raise SupplierResponseError(
                "Валюта баланса поставщика не совпадает с валютой услуги"
            )
    except (
        SupplierNotConfiguredError,
        SupplierRejectedError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
        ValueError,
        KeyError,
        InvalidOperation,
    ) as error:
        logger.warning(
            "Supplier precheck unavailable local_order_id=%s error_type=%s",
            order_id,
            type(error).__name__,
        )
        _save_dispatch_state(
            mark_supplier_precheck_unavailable,
            order_id=order_id,
            error_message=f"{type(error).__name__}: {error}",
        )
        return "supplier_unavailable"

    if supplier_balance.balance < supplier_cost:
        logger.warning(
            "Supplier balance insufficient local_order_id=%s required=%s available=%s",
            order_id,
            supplier_cost,
            supplier_balance.balance,
        )
        _save_dispatch_state(
            mark_insufficient_supplier_balance,
            order_id=order_id,
            required=supplier_cost,
            available=supplier_balance.balance,
            currency=supplier_balance.currency,
        )
        return "insufficient_supplier_balance"

    logger.info(
        "Supplier dispatch started local_order_id=%s supplier_cost=%s",
        order_id,
        supplier_cost,
    )
    try:
        supplier_order = create_supplier_order(
            service_id=order["service_id"],
            recipient_link=order["link"],
            quantity=order["qnt"],
        )
    except SupplierRejectedError as error:
        if _is_insufficient_funds_error(error):
            logger.warning(
                "Supplier add reported insufficient balance local_order_id=%s",
                order_id,
            )
            _save_dispatch_state(
                mark_insufficient_supplier_balance,
                order_id=order_id,
                required=supplier_cost,
                available=supplier_balance.balance,
                currency=supplier_balance.currency,
            )
            return "insufficient_supplier_balance"

        logger.warning(
            "Supplier rejected local_order_id=%s error=%s",
            order_id,
            error,
        )
        _save_dispatch_state(
            mark_dispatch_rejected,
            order_id=order_id,
            error_message=str(error),
        )
        return "rejected"
    except (
        SupplierNotConfiguredError,
        SupplierResponseError,
        HTTPError,
        URLError,
        TimeoutError,
        OSError,
        ValueError,
    ) as error:
        logger.exception("Supplier result is unknown order_id=%s", order_id)
        _save_dispatch_state(
            mark_dispatch_unknown,
            order_id=order_id,
            error_message=f"{type(error).__name__}: {error}",
        )
        return "unknown"

    session = SessionLocal()
    try:
        with session.begin():
            complete_order_dispatch(
                session,
                order_id=order_id,
                supplier_order_id=supplier_order.order_id,
            )
    except Exception as save_error:
        logger.exception(
            "Supplier order created but local save failed order_id=%s supplier_order_id=%s",
            order_id,
            supplier_order.order_id,
        )
        try:
            _save_dispatch_state(
                record_supplier_order_for_review,
                order_id=order_id,
                supplier_order_id=supplier_order.order_id,
                error_message=f"{type(save_error).__name__}: {save_error}",
            )
        except Exception:
            logger.critical(
                "Supplier order ID recovery failed local_order_id=%s supplier_order_id=%s",
                order_id,
                supplier_order.order_id,
                exc_info=True,
            )
        return "save_failed"
    finally:
        session.close()

    logger.info(
        "Supplier order created local_order_id=%s supplier_order_id=%s",
        order_id,
        supplier_order.order_id,
    )
    return "completed"


def retry_dispatch_order(order_id: int) -> str:
    session = SessionLocal()
    try:
        order = get_order_dispatch_state(session, order_id)
    finally:
        session.close()
    if order is None:
        raise OrderNotFoundError("Заказ не найден")
    if order["id_rocket"]:
        raise RetryDispatchError("Заказ уже отправлен поставщику")
    if order["payment_status"] != "processed" or order["processed_at"] is None:
        raise RetryDispatchError("Заказ ещё не оплачен")
    if order["dispatch_status"] not in {
        "not_started",
        "insufficient_supplier_balance",
        "supplier_unavailable",
    }:
        raise RetryDispatchError("Заказ не находится в состоянии безопасного retry")
    return dispatch_order(order_id)


def _owned_supplier_order(order_id: int, user_id: int):
    session = SessionLocal()
    try:
        order = get_order_for_user(session, order_id, user_id)
    finally:
        session.close()
    if order is None:
        raise OrderNotFoundError("Заказ не найден")
    if not order["id_rocket"]:
        raise OrderNotDispatchedError("Заказ ещё не отправлен поставщику")
    return order


SUPPLIER_TO_LOCAL_STATUS = {
    "Pending": "В очереди у поставщика",
    "In progress": "Выполняется",
    "Partial": "Частично выполнен",
    "Completed": "Завершен",
    "Canceled": "Отменен поставщиком",
}


def sync_order_with_supplier(order_id: int, user_id: int):
    order = _owned_supplier_order(order_id, user_id)
    supplier_order_id = int(order["id_rocket"])
    supplier_status = get_supplier_order_status(supplier_order_id)
    local_status = SUPPLIER_TO_LOCAL_STATUS[supplier_status.status]

    session = SessionLocal()
    try:
        with session.begin():
            update_order_from_supplier(
                session,
                order_id=order_id,
                supplier_order_id=supplier_order_id,
                status=local_status,
                remains=supplier_status.remains,
                start_count=supplier_status.start_count,
            )
    finally:
        session.close()
    logger.info(
        "Supplier status updated local_order_id=%s supplier_status=%s",
        order_id,
        supplier_status.status,
    )
    return supplier_status, local_status


def sync_order_safely(order_id: int, user_id: int) -> None:
    now = monotonic()
    with _status_sync_lock:
        last_started_at = _status_sync_started_at.get(order_id, 0)
        if now - last_started_at < STATUS_SYNC_INTERVAL_SECONDS:
            return
        _status_sync_started_at[order_id] = now
    try:
        sync_order_with_supplier(order_id, user_id)
    except Exception as error:
        logger.warning(
            "Supplier status sync failed local_order_id=%s error_type=%s",
            order_id,
            type(error).__name__,
        )


def cancel_order_with_supplier(order_id: int, user_id: int) -> None:
    order = _owned_supplier_order(order_id, user_id)
    supplier_order_id = int(order["id_rocket"])
    cancel_supplier_order(supplier_order_id)

    session = SessionLocal()
    try:
        with session.begin():
            mark_order_cancel_requested(
                session,
                order_id=order_id,
                supplier_order_id=supplier_order_id,
            )
    finally:
        session.close()


def refill_order_with_supplier(order_id: int, user_id: int):
    order = _owned_supplier_order(order_id, user_id)
    return refill_supplier_order(int(order["id_rocket"]))
