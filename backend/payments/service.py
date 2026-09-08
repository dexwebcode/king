import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from threading import Lock
from time import monotonic
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError

from backend.core.config import REFERRAL_REWARD_PERCENT, YOOKASSA_RETURN_URL
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
    create_balance_transaction,
    create_expense,
    create_order_with_payment_attempt,
    get_attempt_by_idempotence_key,
    get_attempt_by_payment_id,
    get_order_dispatch_state,
    get_order_for_user,
    lock_order,
    lock_user,
    mark_dispatch_rejected,
    mark_dispatch_unknown,
    mark_insufficient_supplier_balance,
    mark_order_cancel_requested,
    mark_order_paid,
    mark_payment_canceled,
    mark_payment_processed,
    mark_supplier_precheck_unavailable,
    record_supplier_order_for_review,
    set_attempt_error,
    set_attempt_payment_details,
    set_user_balance,
    update_order_from_supplier,
)
from .yookassa_service import create_yookassa_payment, get_yookassa_payment


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
        "payment_id": attempt.get("provider_payment_id"),
        "confirmation_url": confirmation_url,
        "status": attempt["status"],
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
):
    session = SessionLocal()
    try:
        with session.begin():
            attempt = get_attempt_by_idempotence_key(
                session,
                user_id=user_id,
                idempotence_key=idempotence_key,
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
            )
            return attempt
    except IntegrityError:
        session.rollback()
        attempt = get_attempt_by_idempotence_key(
            session,
            user_id=user_id,
            idempotence_key=idempotence_key,
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

    attempt = _create_or_get_attempt(
        user_id=user_id,
        service_id=persisted_service_id,
        platform=platform,
        quantity=quantity,
        recipient_link=recipient_link,
        amount=amount,
        idempotence_key=idempotence_key,
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


def _validate_payment(payment, attempt) -> Decimal:
    metadata = getattr(payment, "metadata", {}) or {}
    if str(metadata.get("payment_attempt_id")) != str(attempt["id"]):
        raise PaymentVerificationError("payment_attempt_id платежа не совпадает")
    if str(metadata.get("order_id")) != str(attempt["order_id"]):
        raise PaymentVerificationError("order_id платежа не совпадает")
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
