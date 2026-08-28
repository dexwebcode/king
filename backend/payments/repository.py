from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session


PAYMENT_PROVIDER = "yookassa"


def get_account_summary(session: Session, user_id: int):
    return session.execute(
        text("""
            SELECT id, login, mail, balance
            FROM migration_temp.users
            WHERE id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id},
    ).mappings().first()


def get_user_orders(session: Session, user_id: int):
    return session.execute(
        text("""
            SELECT id, soc, service_id, link, qnt, amount, status, date
            FROM migration_temp.orders
            WHERE user_id = :user_id
            ORDER BY id DESC
        """),
        {"user_id": user_id},
    ).mappings().all()


def create_order_with_payment_attempt(
    session: Session,
    *,
    user_id: int,
    service_id: int,
    platform: str,
    recipient_link: str,
    quantity: int,
    amount: Decimal,
    created_at: str,
    idempotence_key: str,
):
    order = session.execute(
        text("""
            INSERT INTO migration_temp.orders (
                id_rocket, soc, user_id, service_id, link, qnt, amount,
                before, posts, date, status, remains, api_order
            ) VALUES (
                0, :platform, :user_id, :service_id, :recipient_link,
                :quantity, :amount, NULL, 0, :created_at,
                'Ожидает оплаты', :quantity, 0
            )
            RETURNING *
        """),
        {
            "platform": platform,
            "user_id": user_id,
            "service_id": service_id,
            "recipient_link": recipient_link,
            "quantity": quantity,
            "amount": amount,
            "created_at": created_at,
        },
    ).mappings().one()

    attempt = session.execute(
        text("""
            INSERT INTO migration_temp.payment_attempts (
                provider, idempotence_key, user_id, order_id,
                amount, currency, status
            ) VALUES (
                :provider, CAST(:idempotence_key AS UUID), :user_id,
                :order_id, :amount, 'RUB', 'creating'
            )
            RETURNING *
        """),
        {
            "provider": PAYMENT_PROVIDER,
            "idempotence_key": idempotence_key,
            "user_id": user_id,
            "order_id": order["id"],
            "amount": amount,
        },
    ).mappings().one()
    return order, attempt


def get_attempt_by_idempotence_key(
    session: Session,
    *,
    user_id: int,
    idempotence_key: str,
    for_update: bool = False,
):
    lock_clause = "FOR UPDATE" if for_update else ""
    return session.execute(
        text(f"""
            SELECT
                p.*,
                o.service_id AS order_service_id,
                o.soc AS order_platform,
                o.link AS order_link,
                o.qnt AS order_quantity,
                o.amount AS order_amount
            FROM migration_temp.payment_attempts AS p
            JOIN migration_temp.orders AS o ON o.id = p.order_id
            WHERE p.provider = :provider
              AND p.idempotence_key = CAST(:idempotence_key AS UUID)
              AND p.user_id = :user_id
            LIMIT 1
            {lock_clause}
        """),
        {
            "provider": PAYMENT_PROVIDER,
            "idempotence_key": idempotence_key,
            "user_id": user_id,
        },
    ).mappings().first()


def get_attempt_by_payment_id(
    session: Session,
    payment_id: str,
    *,
    for_update: bool = False,
):
    lock_clause = "FOR UPDATE" if for_update else ""
    return session.execute(
        text(f"""
            SELECT *
            FROM migration_temp.payment_attempts
            WHERE provider = :provider
              AND provider_payment_id = :payment_id
            LIMIT 1
            {lock_clause}
        """),
        {"provider": PAYMENT_PROVIDER, "payment_id": payment_id},
    ).mappings().first()


def claim_payment_reconciliation(session: Session, payment_id: str) -> bool:
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET updated_at = NOW()
            WHERE provider = :provider
              AND provider_payment_id = :payment_id
              AND processed_at IS NULL
              AND status <> 'canceled'
              AND updated_at < NOW() - INTERVAL '5 seconds'
            RETURNING id
        """),
        {"provider": PAYMENT_PROVIDER, "payment_id": payment_id},
    ).first() is not None


def set_attempt_payment_details(
    session: Session,
    *,
    attempt_id: int,
    payment_id: str,
    payment_status: str,
    confirmation_url: str | None,
):
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET provider_payment_id = :payment_id,
                status = :payment_status,
                confirmation_url = COALESCE(:confirmation_url, confirmation_url),
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND (provider_payment_id IS NULL OR provider_payment_id = :payment_id)
            RETURNING *
        """),
        {
            "attempt_id": attempt_id,
            "payment_id": payment_id,
            "payment_status": payment_status,
            "confirmation_url": confirmation_url,
        },
    ).mappings().first()


def set_attempt_error(
    session: Session,
    *,
    attempt_id: int,
    status: str,
    error_message: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = :status,
                last_error = :error_message,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND processed_at IS NULL
        """),
        {
            "attempt_id": attempt_id,
            "status": status,
            "error_message": error_message[:1000],
        },
    )


def get_order_for_user(session: Session, order_id: int, user_id: int):
    return session.execute(
        text("""
            SELECT
                o.*,
                p.status AS payment_status,
                p.provider_payment_id,
                p.currency,
                p.processed_at,
                p.dispatch_status,
                p.last_error AS payment_error,
                p.dispatch_error
            FROM migration_temp.orders AS o
            LEFT JOIN LATERAL (
                SELECT *
                FROM migration_temp.payment_attempts
                WHERE order_id = o.id
                ORDER BY id DESC
                LIMIT 1
            ) AS p ON TRUE
            WHERE o.id = :order_id
              AND o.user_id = :user_id
            LIMIT 1
        """),
        {"order_id": order_id, "user_id": user_id},
    ).mappings().first()


def lock_user(session: Session, user_id: int):
    return session.execute(
        text("""
            SELECT id, balance
            FROM migration_temp.users
            WHERE id = :user_id
            FOR UPDATE
        """),
        {"user_id": user_id},
    ).mappings().first()


def lock_order(session: Session, order_id: int):
    return session.execute(
        text("""
            SELECT *
            FROM migration_temp.orders
            WHERE id = :order_id
            FOR UPDATE
        """),
        {"order_id": order_id},
    ).mappings().first()


def set_user_balance(
    session: Session,
    *,
    user_id: int,
    balance: Decimal,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.users
            SET balance = :balance
            WHERE id = :user_id
        """),
        {"user_id": user_id, "balance": balance},
    )


def create_balance_transaction(
    session: Session,
    *,
    user_id: int,
    amount: Decimal,
    balance_before: Decimal,
    date: str,
    external_id: str,
) -> int:
    return session.execute(
        text("""
            INSERT INTO migration_temp."transaction" (
                user_id, amount, balance, method, date, "transaction"
            ) VALUES (
                :user_id, :amount, :balance_before,
                :provider, :date, :external_id
            )
            RETURNING id
        """),
        {
            "user_id": str(user_id),
            "amount": amount,
            "balance_before": balance_before,
            "provider": PAYMENT_PROVIDER,
            "date": date,
            "external_id": external_id,
        },
    ).scalar_one()


def create_expense(
    session: Session,
    *,
    user_id: int,
    related_id: int,
    balance_before: Decimal,
    balance_after: Decimal,
    amount: Decimal,
    date: str,
    expense_type: int,
) -> None:
    session.execute(
        text("""
            INSERT INTO migration_temp.expenses (
                user_id, order_id, balance_before, balance_after,
                amount, date, type
            ) VALUES (
                :user_id, :related_id, :balance_before, :balance_after,
                :amount, :date, :expense_type
            )
        """),
        {
            "user_id": str(user_id),
            "related_id": str(related_id),
            "balance_before": balance_before,
            "balance_after": balance_after,
            "amount": amount,
            "date": date,
            "expense_type": expense_type,
        },
    )


def add_referral_reward(
    session: Session,
    *,
    user_id: int,
    reward: Decimal,
) -> None:
    if reward <= 0:
        return
    session.execute(
        text("""
            UPDATE migration_temp.referals
            SET amount = amount + :reward
            WHERE user_id = :user_id
        """),
        {"user_id": user_id, "reward": reward},
    )


def mark_payment_processed(
    session: Session,
    *,
    attempt_id: int,
    transaction_id: int,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = 'processed',
                transaction_id = :transaction_id,
                processed_at = NOW(),
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
        """),
        {"attempt_id": attempt_id, "transaction_id": transaction_id},
    )


def mark_payment_canceled(
    session: Session,
    *,
    attempt_id: int,
    order_id: int | None,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = 'canceled', updated_at = NOW()
            WHERE id = :attempt_id
              AND processed_at IS NULL
        """),
        {"attempt_id": attempt_id},
    )
    if order_id is not None:
        session.execute(
            text("""
                UPDATE migration_temp.orders
                SET status = 'Оплата отменена'
                WHERE id = :order_id
                  AND status = 'Ожидает оплаты'
            """),
            {"order_id": order_id},
        )


def mark_order_paid(session: Session, order_id: int) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Ожидает отправки'
            WHERE id = :order_id
              AND status IN ('Ожидает оплаты', 'Оплата отменена')
        """),
        {"order_id": order_id},
    )


def claim_order_for_dispatch(session: Session, order_id: int):
    order = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Отправляется'
            WHERE id = :order_id
              AND status = 'Ожидает отправки'
              AND id_rocket = 0
            RETURNING id, user_id, service_id, link, qnt, amount
        """),
        {"order_id": order_id},
    ).mappings().first()
    if order is not None:
        session.execute(
            text("""
                UPDATE migration_temp.payment_attempts
                SET dispatch_status = 'sending',
                    dispatch_started_at = NOW(),
                    dispatch_error = NULL,
                    updated_at = NOW()
                WHERE order_id = :order_id
                  AND status = 'processed'
            """),
            {"order_id": order_id},
        )
    return order


def complete_order_dispatch(
    session: Session,
    *,
    order_id: int,
    supplier_order_id: int,
) -> None:
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET id_rocket = :supplier_order_id,
                status = 'Выполняется'
            WHERE id = :order_id
              AND status = 'Отправляется'
              AND id_rocket = 0
        """),
        {"order_id": order_id, "supplier_order_id": supplier_order_id},
    )
    if result.rowcount != 1:
        raise RuntimeError("Не удалось сохранить ID заказа поставщика")

    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'completed',
                dispatch_finished_at = NOW(),
                dispatch_error = NULL,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id},
    )


def mark_dispatch_unknown(
    session: Session,
    *,
    order_id: int,
    error_message: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Требует проверки'
            WHERE id = :order_id
              AND status = 'Отправляется'
        """),
        {"order_id": order_id},
    )
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'unknown',
                dispatch_finished_at = NOW(),
                dispatch_error = :error_message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "error_message": error_message[:1000]},
    )


def has_order_refund(session: Session, order_id: int) -> bool:
    return bool(session.execute(
        text("""
            SELECT EXISTS (
                SELECT 1
                FROM migration_temp.expenses
                WHERE type = 1
                  AND order_id = :order_id
            )
        """),
        {"order_id": str(order_id)},
    ).scalar_one())


def cancel_order_after_rejection(
    session: Session,
    *,
    order_id: int,
    error_message: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Отменен', amount = 0, remains = qnt
            WHERE id = :order_id
        """),
        {"order_id": order_id},
    )
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'rejected',
                dispatch_finished_at = NOW(),
                dispatch_error = :error_message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "error_message": error_message[:1000]},
    )
