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


def get_user_orders(
    session: Session,
    user_id: int,
    *,
    limit: int = 50,
    before_id: int | None = None,
):
    """Страница заказов пользователя (keyset по id DESC)."""
    return session.execute(
        text("""
            SELECT
                o.id,
                o.soc,
                o.service_id,
                o.link,
                o.qnt,
                o.amount,
                o.status,
                o.remains,
                o.id_rocket,
                o.date,
                p.dispatch_status
            FROM migration_temp.orders AS o
            LEFT JOIN migration_temp.payment_attempts AS p
              ON p.order_id = o.id
            WHERE o.user_id = :user_id
              AND (:before_id IS NULL OR o.id < :before_id)
            ORDER BY o.id DESC
            LIMIT :limit
        """),
        {"user_id": user_id, "before_id": before_id, "limit": limit},
    ).mappings().all()


def get_orders_due_for_status_sync(
    session: Session,
    *,
    limit: int = 30,
    due_seconds: int = 60,
    max_age_days: int = 30,
):
    """Активные заказы, которым пора обновить статус у поставщика.

    Ограничено батчем и интервалом due_seconds — заменяет fan-out при открытии
    списка заказов ограниченным фоновым worker'ом. Берём только «свежие» заказы
    (по payment_attempts.created_at): старые заказы в «Выполняется»/«Частично»
    поставщик уже не отдаёт по action=status и отвечает error.
    """
    return session.execute(
        text("""
            SELECT o.id, o.user_id
            FROM migration_temp.orders AS o
            WHERE o.id_rocket <> 0
              AND o.status NOT IN (
                  'Завершен',
                  'Отменен поставщиком',
                  'Готово',
                  'Отменен'
              )
              AND EXISTS (
                  SELECT 1
                  FROM migration_temp.payment_attempts AS p
                  WHERE p.order_id = o.id
                    AND p.created_at >= NOW() - (:max_age_days * INTERVAL '1 day')
              )
              AND (
                  o.last_synced_at IS NULL
                  OR o.last_synced_at < NOW() - (:due_seconds * INTERVAL '1 second')
              )
            ORDER BY o.last_synced_at ASC NULLS FIRST, o.id ASC
            LIMIT :limit
        """),
        {"limit": limit, "due_seconds": due_seconds, "max_age_days": max_age_days},
    ).mappings().all()


def mark_order_status_synced(session: Session, order_id: int) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET last_synced_at = NOW()
            WHERE id = :order_id
        """),
        {"order_id": order_id},
    )


def create_order_with_payment_attempt(
    session: Session,
    *,
    user_id: int,
    service_id: int,
    platform: str,
    recipient_link: str,
    quantity: int,
    amount: Decimal,
    supplier_cost: Decimal,
    created_at: str,
    idempotence_key: str,
    provider: str = PAYMENT_PROVIDER,
):
    order = session.execute(
        text("""
            INSERT INTO migration_temp.orders (
                id_rocket, soc, user_id, service_id, link, qnt, amount,
                supplier_cost, before, posts, date, status, remains, api_order
            ) VALUES (
                0, :platform, :user_id, :service_id, :recipient_link,
                :quantity, :amount, :supplier_cost, NULL, 0, :created_at,
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
            "supplier_cost": supplier_cost,
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
            "provider": provider,
            "idempotence_key": idempotence_key,
            "user_id": user_id,
            "order_id": order["id"],
            "amount": amount,
        },
    ).mappings().one()
    return order, attempt


def create_balance_topup_attempt(
    session: Session,
    *,
    user_id: int,
    amount: Decimal,
    idempotence_key: str,
    provider: str = PAYMENT_PROVIDER,
):
    return session.execute(
        text("""
            INSERT INTO migration_temp.payment_attempts (
                provider, idempotence_key, user_id, order_id,
                amount, currency, status, purpose
            ) VALUES (
                :provider, CAST(:idempotence_key AS UUID), :user_id, NULL,
                :amount, 'RUB', 'creating', 'balance_topup'
            )
            RETURNING *
        """),
        {
            "provider": provider,
            "idempotence_key": idempotence_key,
            "user_id": user_id,
            "amount": amount,
        },
    ).mappings().one()


def get_attempt_by_idempotence_key(
    session: Session,
    *,
    user_id: int,
    idempotence_key: str,
    for_update: bool = False,
    provider: str = PAYMENT_PROVIDER,
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
            LEFT JOIN migration_temp.orders AS o ON o.id = p.order_id
            WHERE p.provider = :provider
              AND p.idempotence_key = CAST(:idempotence_key AS UUID)
              AND p.user_id = :user_id
            LIMIT 1
            {lock_clause}
        """),
        {
            "provider": provider,
            "idempotence_key": idempotence_key,
            "user_id": user_id,
        },
    ).mappings().first()


def get_balance_topup_for_user(session: Session, top_up_id: int, user_id: int):
    return session.execute(
        text("""
            SELECT *
            FROM migration_temp.payment_attempts
            WHERE id = :top_up_id
              AND user_id = :user_id
              AND purpose = 'balance_topup'
            LIMIT 1
        """),
        {"top_up_id": top_up_id, "user_id": user_id},
    ).mappings().first()


def get_attempt_by_payment_id(
    session: Session,
    payment_id: str,
    *,
    for_update: bool = False,
    provider: str = PAYMENT_PROVIDER,
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
        {"provider": provider, "payment_id": payment_id},
    ).mappings().first()


def get_attempt_by_provider_order_id(
    session: Session,
    order_id: str,
    *,
    for_update: bool = False,
    provider: str = PAYMENT_PROVIDER,
):
    lock_clause = "FOR UPDATE" if for_update else ""
    return session.execute(
        text(f"""
            SELECT *
            FROM migration_temp.payment_attempts
            WHERE provider = :provider
              AND provider_order_id = :order_id
            LIMIT 1
            {lock_clause}
        """),
        {"provider": provider, "order_id": order_id},
    ).mappings().first()


def set_attempt_heleket_details(
    session: Session,
    *,
    attempt_id: int,
    provider_order_id: str,
    payment_id: str,
    payment_status: str,
    confirmation_url: str | None,
    expires_at=None,
):
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET provider_order_id = COALESCE(provider_order_id, :provider_order_id),
                provider_payment_id = :payment_id,
                status = :payment_status,
                confirmation_url = COALESCE(:confirmation_url, confirmation_url),
                expires_at = COALESCE(:expires_at, expires_at),
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND (provider_payment_id IS NULL OR provider_payment_id = :payment_id)
              AND status NOT IN ('cancel_requested', 'canceled', 'paid_after_cancel')
            RETURNING *
        """),
        {
            "attempt_id": attempt_id,
            "provider_order_id": provider_order_id,
            "payment_id": payment_id,
            "payment_status": payment_status,
            "confirmation_url": confirmation_url,
            "expires_at": expires_at,
        },
    ).mappings().first()


def get_payment_attempt_for_user(session: Session, attempt_id: int, user_id: int):
    return session.execute(
        text('''
            SELECT p.*, o.status AS order_status
            FROM migration_temp.payment_attempts AS p
            LEFT JOIN migration_temp.orders AS o ON o.id = p.order_id
            WHERE p.id = :attempt_id
              AND p.user_id = :user_id
            LIMIT 1
        '''),
        {'attempt_id': attempt_id, 'user_id': user_id},
    ).mappings().first()


def request_payment_cancellation(session: Session, attempt_id: int, user_id: int):
    attempt = session.execute(
        text('''
            UPDATE migration_temp.payment_attempts
            SET status = 'cancel_requested',
                confirmation_url = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND user_id = :user_id
              AND processed_at IS NULL
              AND status NOT IN ('canceled', 'expired', 'paid_after_cancel')
            RETURNING *
        '''),
        {'attempt_id': attempt_id, 'user_id': user_id},
    ).mappings().first()
    if attempt is not None and attempt.get('order_id') is not None:
        session.execute(
            text('''
                UPDATE migration_temp.orders
                SET status = 'Оплата отменена'
                WHERE id = :order_id
                  AND user_id = :user_id
                  AND status = 'Ожидает оплаты'
            '''),
            {'order_id': attempt['order_id'], 'user_id': user_id},
        )
    return attempt


def mark_provider_cancel_pending(session: Session, attempt_id: int) -> None:
    """Помечает, что отмена у провайдера ещё не выполнена (нужен повтор)."""
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET provider_cancel_pending_at = NOW(),
                updated_at = NOW()
            WHERE id = :attempt_id
        """),
        {"attempt_id": attempt_id},
    )


def clear_provider_cancel_pending(session: Session, attempt_id: int) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET provider_cancel_pending_at = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
        """),
        {"attempt_id": attempt_id},
    )


def get_pending_provider_cancellations(
    session: Session,
    *,
    limit: int = 20,
    min_age_seconds: int = 60,
):
    """Отмены ЮKassa, которые не удалось выполнить у провайдера."""
    return session.execute(
        text("""
            SELECT id, provider_payment_id
            FROM migration_temp.payment_attempts
            WHERE provider = 'yookassa'
              AND status = 'cancel_requested'
              AND processed_at IS NULL
              AND provider_cancel_pending_at IS NOT NULL
              AND provider_cancel_pending_at < NOW() - (:min_age_seconds * INTERVAL '1 second')
            ORDER BY provider_cancel_pending_at ASC
            LIMIT :limit
        """),
        {"limit": limit, "min_age_seconds": min_age_seconds},
    ).mappings().all()


def claim_payment_reconciliation(
    session: Session,
    payment_id: str,
    *,
    provider: str = PAYMENT_PROVIDER,
) -> bool:
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET updated_at = NOW()
            WHERE provider = :provider
              AND provider_payment_id = :payment_id
              AND processed_at IS NULL
              AND status NOT IN ('canceled', 'cancel_requested', 'paid_after_cancel')
              AND updated_at < NOW() - INTERVAL '5 seconds'
            RETURNING id
        """),
        {"provider": provider, "payment_id": payment_id},
    ).first() is not None


def set_attempt_payment_details(
    session: Session,
    *,
    attempt_id: int,
    payment_id: str,
    payment_status: str,
    confirmation_url: str | None,
    expires_at=None,
):
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET provider_payment_id = :payment_id,
                status = :payment_status,
                confirmation_url = COALESCE(:confirmation_url, confirmation_url),
                expires_at = COALESCE(:expires_at, expires_at),
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND (provider_payment_id IS NULL OR provider_payment_id = :payment_id)
              AND status NOT IN ('cancel_requested', 'canceled', 'paid_after_cancel')
            RETURNING *
        """),
        {
            "attempt_id": attempt_id,
            "payment_id": payment_id,
            "payment_status": payment_status,
            "confirmation_url": confirmation_url,
            "expires_at": expires_at,
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


def claim_invoice_creation(session: Session, attempt_id: int):
    """Атомарно резервирует попытку для одного вызова invoice/create.

    Возвращает попытку, если этот запрос получил право вызвать провайдера,
    иначе None (конкурентный запрос уже создаёт или создал инвойс). Устаревший
    claim (сбой процесса после claim) можно перехватить повторно.
    """
    return session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = 'creating_in_progress',
                updated_at = NOW()
            WHERE id = :attempt_id
              AND provider_payment_id IS NULL
              AND processed_at IS NULL
              AND status NOT IN ('cancel_requested', 'canceled', 'paid_after_cancel')
              AND (
                  status <> 'creating_in_progress'
                  OR updated_at < NOW() - INTERVAL '30 seconds'
              )
            RETURNING *
        """),
        {"attempt_id": attempt_id},
    ).mappings().first()


def set_attempt_creation_error(
    session: Session,
    *,
    attempt_id: int,
    status: str,
    error_message: str,
) -> None:
    """Помечает ошибкой только попытку БЕЗ сохранённого инвойса.

    Не перезаписывает состояние, которое уже сохранил конкурентный запрос
    (provider_payment_id заполнен) — иначе валидная попытка выглядела бы ошибкой.
    """
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = :status,
                last_error = :error_message,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND processed_at IS NULL
              AND provider_payment_id IS NULL
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
                p.provider,
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


def get_order_dispatch_state(session: Session, order_id: int):
    return session.execute(
        text("""
            SELECT
                o.*,
                p.status AS payment_status,
                p.processed_at,
                p.dispatch_status,
                p.dispatch_started_at,
                p.dispatch_error
            FROM migration_temp.orders AS o
            LEFT JOIN migration_temp.payment_attempts AS p
              ON p.order_id = o.id
            WHERE o.id = :order_id
            LIMIT 1
        """),
        {"order_id": order_id},
    ).mappings().first()


def get_supplier_attention_orders(session: Session):
    return session.execute(
        text("""
            SELECT
                o.id,
                o.service_id,
                o.link,
                o.qnt,
                o.amount,
                o.supplier_cost,
                o.status,
                o.id_rocket,
                o.date,
                p.dispatch_status,
                p.dispatch_error,
                p.dispatch_started_at,
                p.updated_at
            FROM migration_temp.orders AS o
            JOIN migration_temp.payment_attempts AS p
              ON p.order_id = o.id
            WHERE p.status = 'processed'
              AND (
                  p.dispatch_status IN (
                      'not_started',
                      'insufficient_supplier_balance',
                      'supplier_unavailable',
                      'unknown',
                      'rejected',
                      'save_failed',
                      'price_changed'
                  )
                  OR (
                      p.dispatch_status = 'sending'
                      AND p.dispatch_started_at < NOW() - INTERVAL '5 minutes'
                  )
              )
            ORDER BY p.updated_at ASC, o.id ASC
        """),
    ).mappings().all()


def get_stale_dispatch_orders_for_alert(
    session: Session,
    *,
    limit: int = 20,
    stale_minutes: int = 5,
):
    """Заказы, зависшие в отправке (sending/unknown) и ещё не уведомлённые.

    dispatch_alerted_at IS NULL гарантирует однократную отправку алерта.
    """
    return session.execute(
        text("""
            SELECT o.id, o.link, o.qnt, o.amount, p.dispatch_status
            FROM migration_temp.orders AS o
            JOIN migration_temp.payment_attempts AS p
              ON p.order_id = o.id
            WHERE p.status = 'processed'
              AND o.dispatch_alerted_at IS NULL
              AND (
                  p.dispatch_status = 'unknown'
                  OR (
                      p.dispatch_status = 'sending'
                      AND p.dispatch_started_at < NOW() - (:stale_minutes * INTERVAL '1 minute')
                  )
              )
            ORDER BY p.updated_at ASC, o.id ASC
            LIMIT :limit
        """),
        {"limit": limit, "stale_minutes": stale_minutes},
    ).mappings().all()


def mark_dispatch_alerted(session: Session, order_id: int) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET dispatch_alerted_at = NOW()
            WHERE id = :order_id
        """),
        {"order_id": order_id},
    )


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
    provider: str = PAYMENT_PROVIDER,
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
            "provider": provider,
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
    credited_amount: Decimal | None = None,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = 'processed',
                transaction_id = :transaction_id,
                processed_at = NOW(),
                credited_amount = COALESCE(:credited_amount, credited_amount),
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
        """),
        {
            "attempt_id": attempt_id,
            "transaction_id": transaction_id,
            "credited_amount": credited_amount,
        },
    )


def set_attempt_status(
    session: Session,
    *,
    attempt_id: int,
    status: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = :status,
                last_error = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND processed_at IS NULL
        """),
        {"attempt_id": attempt_id, "status": status[:32]},
    )


def list_expired_unpaid_attempts(
    session: Session,
    *,
    timeout_minutes: int,
    limit: int = 50,
):
    """Попытки, которые так и не были оплачены в течение окна оплаты."""
    return session.execute(
        text("""
            SELECT *
            FROM migration_temp.payment_attempts
            WHERE processed_at IS NULL
              AND status NOT IN ('canceled', 'cancel_requested', 'expired', 'paid_after_cancel')
              AND created_at <= NOW() - (:timeout_minutes * INTERVAL '1 minute')
            ORDER BY created_at
            LIMIT :limit
        """),
        {"timeout_minutes": timeout_minutes, "limit": limit},
    ).mappings().all()


def expire_payment_attempt(
    session: Session,
    *,
    attempt_id: int,
    order_id: int | None,
) -> bool:
    """Помечает попытку истёкшей и снимает её заказ с ожидания оплаты.

    Условия в UPDATE не дают отменить платёж, который провайдер подтвердил
    между выборкой и записью: такая попытка просто не обновится.
    """
    expired = session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET status = 'expired',
                confirmation_url = NULL,
                updated_at = NOW()
            WHERE id = :attempt_id
              AND processed_at IS NULL
              AND status NOT IN ('canceled', 'cancel_requested', 'expired', 'paid_after_cancel')
            RETURNING id
        """),
        {"attempt_id": attempt_id},
    ).first()
    if expired is None:
        return False
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
    return True


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


def get_dispatch_candidate_ids(
    session: Session,
    *,
    limit: int = 50,
) -> list[int]:
    """Оплаченные заказы, которые можно безопасно отправить поставщику.

    Только состояния, в которых заказ у поставщика ещё не создавался
    (id_rocket = 0), поэтому повторная отправка не создаст дубликат: платёж
    обработан, а dispatch_status ещё not_started либо завершился определённой
    ошибкой до создания заказа (insufficient_supplier_balance /
    supplier_unavailable). Состояния unknown / rejected / save_failed сюда не
    входят — они требуют ручной проверки администратора.
    """
    rows = session.execute(
        text("""
            SELECT o.id
            FROM migration_temp.orders AS o
            JOIN migration_temp.payment_attempts AS p
              ON p.order_id = o.id
            WHERE p.purpose = 'order'
              AND p.status = 'processed'
              AND p.processed_at IS NOT NULL
              AND o.id_rocket = 0
              AND p.dispatch_status IN (
                  'not_started',
                  'insufficient_supplier_balance',
                  'supplier_unavailable'
              )
            ORDER BY o.id
            LIMIT :limit
        """),
        {"limit": limit},
    ).scalars().all()
    return [int(order_id) for order_id in rows]


def claim_order_for_dispatch(session: Session, order_id: int):
    order = session.execute(
        text("""
            UPDATE migration_temp.orders AS o
            SET status = 'Отправляется'
            WHERE o.id = :order_id
              AND o.status IN (
                  'Ожидает отправки',
                  'Ожидает пополнения поставщика',
                  'Поставщик недоступен'
              )
              AND o.id_rocket = 0
              AND EXISTS (
                  SELECT 1
                  FROM migration_temp.payment_attempts AS p
                  WHERE p.order_id = o.id
                    AND p.status = 'processed'
                    AND p.dispatch_status IN (
                        'not_started',
                        'insufficient_supplier_balance',
                        'supplier_unavailable'
                    )
              )
            RETURNING id, user_id, service_id, link, qnt, amount, supplier_cost
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


def reopen_dispatch_for_retry(session: Session, order_id: int) -> bool:
    """Возвращает заказ с неопределённым исходом отправки в очередь повторной.

    Используется только после того, как оператор подтвердил по панели
    поставщика, что заказ у поставщика создан НЕ был. Переход атомарный и
    безопасный: срабатывает только для заказа без внешнего id_rocket.
    """
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Ожидает отправки'
            WHERE id = :order_id
              AND id_rocket = 0
              AND status IN ('Отправляется', 'Требует проверки')
        """),
        {"order_id": order_id},
    )
    if result.rowcount != 1:
        return False
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'not_started',
                dispatch_started_at = NULL,
                dispatch_error = NULL,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
              AND dispatch_status IN ('sending', 'unknown')
        """),
        {"order_id": order_id},
    )
    return True


def record_reconciled_supplier_order(
    session: Session,
    *,
    order_id: int,
    supplier_order_id: int,
    status: str,
) -> None:
    """Фиксирует внешний ID заказа, найденный оператором при сверке.

    В отличие от повторной отправки, не вызывает action=add: поставщик заказ уже
    создал, локально лишь сохраняется его ID. Уникальный индекс по id_rocket
    защищает от привязки чужого заказа.
    """
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET id_rocket = :supplier_order_id,
                status = :status
            WHERE id = :order_id
              AND id_rocket = 0
              AND status IN ('Отправляется', 'Требует проверки')
        """),
        {
            "order_id": order_id,
            "supplier_order_id": supplier_order_id,
            "status": status,
        },
    )
    if result.rowcount != 1:
        raise RuntimeError("Не удалось зафиксировать ID заказа поставщика")
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'completed',
                dispatch_started_at = NULL,
                dispatch_finished_at = NOW(),
                dispatch_error = NULL,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id},
    )


def mark_insufficient_supplier_balance(
    session: Session,
    *,
    order_id: int,
    required: Decimal,
    available: Decimal,
    currency: str,
) -> None:
    message = (
        f"required={required} available={available} currency={currency}"
    )
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Ожидает пополнения поставщика'
            WHERE id = :order_id
              AND status = 'Отправляется'
              AND id_rocket = 0
        """),
        {"order_id": order_id},
    )
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'insufficient_supplier_balance',
                dispatch_finished_at = NOW(),
                dispatch_error = :message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "message": message},
    )


def mark_supplier_precheck_unavailable(
    session: Session,
    *,
    order_id: int,
    error_message: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Поставщик недоступен'
            WHERE id = :order_id
              AND status = 'Отправляется'
              AND id_rocket = 0
        """),
        {"order_id": order_id},
    )
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'supplier_unavailable',
                dispatch_finished_at = NOW(),
                dispatch_error = :error_message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "error_message": error_message[:1000]},
    )


def mark_dispatch_rejected(
    session: Session,
    *,
    order_id: int,
    error_message: str,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Отклонен поставщиком'
            WHERE id = :order_id
              AND status = 'Отправляется'
              AND id_rocket = 0
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


def mark_dispatch_price_changed(
    session: Session,
    *,
    order_id: int,
    error_message: str,
) -> None:
    """Фиксирует конфликт себестоимости: заказ требует ручной проверки.

    Заказ не отправляется автоматически — администратор решает, делать ли
    пересчёт/возврат. Повторная отправка не должна выполняться слепо.
    """
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Цена изменилась'
            WHERE id = :order_id
              AND status = 'Отправляется'
              AND id_rocket = 0
        """),
        {"order_id": order_id},
    )
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'price_changed',
                dispatch_finished_at = NOW(),
                dispatch_error = :message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "message": error_message[:1000]},
    )


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


def record_supplier_order_for_review(
    session: Session,
    *,
    order_id: int,
    supplier_order_id: int,
    error_message: str,
) -> None:
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET id_rocket = :supplier_order_id,
                status = 'Требует проверки'
            WHERE id = :order_id
              AND id_rocket IN (0, :supplier_order_id)
        """),
        {"order_id": order_id, "supplier_order_id": supplier_order_id},
    )
    if result.rowcount != 1:
        raise RuntimeError("Не удалось сохранить supplier order ID для проверки")

    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'save_failed',
                dispatch_finished_at = NOW(),
                dispatch_error = :error_message,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
        """),
        {"order_id": order_id, "error_message": error_message[:1000]},
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


def update_order_from_supplier(
    session: Session,
    *,
    order_id: int,
    supplier_order_id: int,
    status: str,
    remains: int,
    start_count: int,
) -> None:
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = :status,
                remains = :remains,
                before = :start_count
            WHERE id = :order_id
              AND id_rocket = :supplier_order_id
              AND id_rocket <> 0
        """),
        {
            "order_id": order_id,
            "supplier_order_id": supplier_order_id,
            "status": status,
            "remains": remains,
            "start_count": start_count,
        },
    )
    if result.rowcount != 1:
        raise RuntimeError("Локальный заказ изменился во время синхронизации")


def mark_order_cancel_requested(
    session: Session,
    *,
    order_id: int,
    supplier_order_id: int,
) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = 'Отмена запрошена'
            WHERE id = :order_id
              AND id_rocket = :supplier_order_id
              AND id_rocket <> 0
        """),
        {"order_id": order_id, "supplier_order_id": supplier_order_id},
    )
