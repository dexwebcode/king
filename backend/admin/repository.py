"""Сырые SQL-запросы административной панели к PostgreSQL.

Все запросы параметризованы (никакой интерполяции пользовательских значений),
сортировка и группировка выбираются из фиксированных словарей.
"""

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

# Дата заказа: для заказов с обработанным платежом — фактическое время
# оплаты, для legacy-строк — orders.date (локальное время, Europe/Moscow).
ORDER_TS = (
    "COALESCE(p.processed_at, TO_TIMESTAMP(o.date, 'HH24:MI:SS DD.MM.YYYY'))"
)

# Заказ считается оплаченным, если есть обработанный платёж, либо (legacy)
# платежа нет, но статус не относится к неоплаченным.
PAID_CLAUSE = """
    (
        EXISTS (
            SELECT 1 FROM migration_temp.payment_attempts AS pa
            WHERE pa.order_id = o.id AND pa.status = 'processed'
        )
        OR (
            NOT EXISTS (
                SELECT 1 FROM migration_temp.payment_attempts AS pa
                WHERE pa.order_id = o.id
            )
            AND o.status NOT IN ('Ожидает оплаты', 'Оплата отменена')
        )
    )
"""

ORDER_LIST_BASE = f"""
    SELECT
        o.id, o.id_rocket, o.user_id, o.soc, o.service_id, o.link,
        o.qnt, o.amount, o.supplier_cost, o.status, o.remains, o.date,
        COALESCE(NULLIF(u.login, ''), NULLIF(u.mail, ''), 'ID ' || u.id::text)
            AS user_login,
        {ORDER_TS} AS created_ts,
        p.provider, p.status AS payment_status, p.dispatch_status,
        p.updated_at AS payment_updated_at
    FROM migration_temp.orders AS o
    JOIN migration_temp.users AS u ON u.id = o.user_id
    LEFT JOIN LATERAL (
        SELECT provider, status, dispatch_status, processed_at, updated_at
        FROM migration_temp.payment_attempts
        WHERE order_id = o.id
        ORDER BY id DESC
        LIMIT 1
    ) AS p ON TRUE
"""

ORDER_SORT = {
    "newest": "created_ts DESC, o.id DESC",
    "oldest": "created_ts ASC, o.id ASC",
    "amount_desc": "o.amount DESC, o.id DESC",
    "amount_asc": "o.amount ASC, o.id DESC",
}


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _money(value) -> str | None:
    if value is None:
        return None
    return format(value, ".2f")


def serialize_order(row) -> dict:
    return {
        "id": row["id"],
        "supplier_order_id": row["id_rocket"] or None,
        "user_id": row["user_id"],
        "user_login": row["user_login"],
        "platform": row["soc"],
        "service_id": row["service_id"],
        "link": row["link"],
        "quantity": row["qnt"],
        "amount": _money(row["amount"]),
        "supplier_cost": _money(row["supplier_cost"]),
        "status": row["status"],
        "remains": row["remains"],
        "created_at": row["date"],
        "created_ts": _iso(row["created_ts"]),
        "provider": row["provider"],
        "payment_status": row["payment_status"],
        "dispatch_status": row["dispatch_status"],
        "payment_updated_at": _iso(row["payment_updated_at"]),
    }


def list_admin_orders(
    session: Session,
    *,
    page: int,
    limit: int,
    search: str | None,
    status: str | None,
    start_ts: datetime | None,
    end_ts: datetime | None,
    sort: str,
):
    clauses = []
    params: dict = {}
    if status:
        clauses.append("o.status = :status")
        params["status"] = status
    if search:
        like = f"%{search}%"
        params["search_like"] = like
        if search.isdigit():
            params["search_digits"] = search
            clauses.append(
                "(o.id::text = :search_digits"
                " OR o.user_id::text = :search_digits"
                " OR o.id_rocket::text = :search_digits"
                " OR o.link ILIKE :search_like"
                " OR u.login ILIKE :search_like"
                " OR COALESCE(u.mail, '') ILIKE :search_like)"
            )
        else:
            clauses.append(
                "(o.link ILIKE :search_like"
                " OR u.login ILIKE :search_like"
                " OR COALESCE(u.mail, '') ILIKE :search_like)"
            )
    if start_ts is not None:
        clauses.append(f"{ORDER_TS} >= :start_ts")
        params["start_ts"] = start_ts
    if end_ts is not None:
        clauses.append(f"{ORDER_TS} < :end_ts")
        params["end_ts"] = end_ts
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    order_by = ORDER_SORT[sort]

    rows = session.execute(
        text(
            ORDER_LIST_BASE
            + where
            + f" ORDER BY {order_by} LIMIT :limit OFFSET :offset"
        ),
        {
            **params,
            "limit": limit,
            "offset": (page - 1) * limit,
        },
    ).mappings().all()

    total = session.execute(
        text(f"SELECT COUNT(*) FROM migration_temp.orders AS o "
             f"JOIN migration_temp.users AS u ON u.id = o.user_id "
             f"LEFT JOIN LATERAL (SELECT processed_at FROM migration_temp.payment_attempts WHERE order_id = o.id AND status = 'processed' ORDER BY id DESC LIMIT 1) AS p ON TRUE"
             f"{where}"),
        params,
    ).scalar_one()
    return rows, int(total)


def get_admin_order(session: Session, order_id: int):
    return session.execute(
        text("""
            SELECT
                o.*,
                u.login AS user_login,
                u.mail AS user_mail,
                u.balance AS user_balance,
                p.id AS payment_attempt_id,
                p.provider,
                p.provider_payment_id,
                p.status AS payment_status,
                p.dispatch_status,
                p.dispatch_error,
                p.last_error AS payment_error,
                p.processed_at,
                p.created_at AS payment_created_at,
                p.updated_at AS payment_updated_at
            FROM migration_temp.orders AS o
            JOIN migration_temp.users AS u ON u.id = o.user_id
            LEFT JOIN LATERAL (
                SELECT *
                FROM migration_temp.payment_attempts
                WHERE order_id = o.id
                ORDER BY id DESC
                LIMIT 1
            ) AS p ON TRUE
            WHERE o.id = :order_id
            LIMIT 1
        """),
        {"order_id": order_id},
    ).mappings().first()


def _legacy_date_iso(value: str | None) -> str | None:
    """Парсит legacy-строку даты 'HH:MI:SS DD.MM.YYYY' в ISO (Europe/Moscow)."""
    if not value:
        return None
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        parsed = datetime.strptime(value, "%H:%M:%S %d.%m.%Y")
        return parsed.replace(tzinfo=ZoneInfo("Europe/Moscow")).isoformat()
    except ValueError:
        return str(value)


def serialize_order_detail(row) -> dict:
    if row is None:
        return None
    return {
        "id": row["id"],
        "supplier_order_id": row["id_rocket"] or None,
        "user": {
            "id": row["user_id"],
            "login": row["user_login"],
            "email": row["user_mail"],
            "balance": _money(row["user_balance"]),
        },
        "platform": row["soc"],
        "service_id": row["service_id"],
        "link": row["link"],
        "quantity": row["qnt"],
        "amount": _money(row["amount"]),
        "supplier_cost": _money(row["supplier_cost"]),
        "status": row["status"],
        "remains": row["remains"],
        "before": row["before"],
        "posts": row["posts"],
        "api_order": row["api_order"],
        "created_at": row["date"],
        "created_ts": _iso(row["processed_at"]) or _legacy_date_iso(row["date"]),
        "payment": {
            "attempt_id": row["payment_attempt_id"],
            "provider": row["provider"],
            "provider_payment_id": row["provider_payment_id"],
            "status": row["payment_status"],
            "dispatch_status": row["dispatch_status"],
            "dispatch_error": row["dispatch_error"],
            "payment_error": row["payment_error"],
            "processed_at": _iso(row["processed_at"]),
            "created_at": _iso(row["payment_created_at"]),
            "updated_at": _iso(row["payment_updated_at"]),
        },
    }


def update_order_status(session: Session, order_id: int, status: str) -> int | None:
    """Меняет статус только у заказа, ещё не созданного у поставщика."""
    result = session.execute(
        text("""
            UPDATE migration_temp.orders
            SET status = :status
            WHERE id = :order_id
              AND id_rocket = 0
            RETURNING id
        """),
        {"order_id": order_id, "status": status},
    ).scalar_one_or_none()
    return result


def reset_attempt_dispatch(session: Session, order_id: int) -> None:
    """Возвращает оплаченную попытку в безопасную очередь отправки.

    Только из состояний, которые и так считаются повторяемыми (те же
    условия, что у штатного retry-dispatch).
    """
    session.execute(
        text("""
            UPDATE migration_temp.payment_attempts
            SET dispatch_status = 'not_started',
                dispatch_error = NULL,
                updated_at = NOW()
            WHERE order_id = :order_id
              AND status = 'processed'
              AND dispatch_status IN (
                  'not_started',
                  'insufficient_supplier_balance',
                  'supplier_unavailable'
              )
        """),
        {"order_id": order_id},
    )


USER_LIST_BASE = """
    SELECT
        u.id, u.login, u.mail, u.user_group, u.balance, u.banned,
        u.created_at, u.last_seen_at, u.ban_reason, u.banned_at,
        COALESCE(s.orders_count, 0) AS orders_count,
        COALESCE(s.orders_sum, 0) AS orders_sum
    FROM migration_temp.users AS u
    LEFT JOIN (
        SELECT o.user_id,
               COUNT(*) AS orders_count,
               COALESCE(
                   SUM(o.amount) FILTER (
                       WHERE EXISTS (
                           SELECT 1 FROM migration_temp.payment_attempts AS pa
                           WHERE pa.order_id = o.id AND pa.status = 'processed'
                       )
                       OR (
                           NOT EXISTS (
                               SELECT 1 FROM migration_temp.payment_attempts AS pa
                               WHERE pa.order_id = o.id
                           )
                           AND o.status NOT IN ('Ожидает оплаты', 'Оплата отменена')
                       )
                   ),
                   0
               ) AS orders_sum
        FROM migration_temp.orders AS o
        GROUP BY o.user_id
    ) AS s ON s.user_id = u.id
"""

USER_SORT = {
    "newest": "u.created_at DESC NULLS LAST, u.id DESC",
    "oldest": "u.created_at ASC NULLS LAST, u.id ASC",
    "id_desc": "u.id DESC",
    "id_asc": "u.id ASC",
    "balance_desc": "u.balance DESC, u.id DESC",
    "balance_asc": "u.balance ASC, u.id DESC",
    "orders_desc": "orders_count DESC, u.id DESC",
}


def serialize_user(row) -> dict:
    return {
        "id": row["id"],
        "login": row["login"],
        "email": row["mail"],
        "user_group": row["user_group"],
        "balance": _money(row["balance"]),
        "banned": bool(row["banned"]),
        "created_at": _iso(row["created_at"]),
        "last_seen_at": _iso(row["last_seen_at"]),
        "ban_reason": row["ban_reason"],
        "banned_at": _iso(row["banned_at"]),
        "orders_count": int(row["orders_count"] or 0),
        "orders_sum": _money(row["orders_sum"] or 0),
    }


def list_admin_users(
    session: Session,
    *,
    page: int,
    limit: int,
    search: str | None,
    banned: str | None,
    user_group: str | None,
    sort: str,
):
    clauses = []
    params: dict = {}
    if search:
        like = f"%{search}%"
        params["search_like"] = like
        if search.isdigit():
            params["search_digits"] = search
            clauses.append(
                "(u.id::text = :search_digits"
                " OR u.login ILIKE :search_like"
                " OR COALESCE(u.mail, '') ILIKE :search_like)"
            )
        else:
            clauses.append(
                "(u.login ILIKE :search_like"
                " OR COALESCE(u.mail, '') ILIKE :search_like)"
            )
    if banned == "banned":
        clauses.append("u.banned <> 0")
    elif banned == "active":
        clauses.append("u.banned = 0")
    if user_group:
        clauses.append("u.user_group = :user_group")
        params["user_group"] = user_group
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    order_by = USER_SORT[sort]

    rows = session.execute(
        text(
            USER_LIST_BASE
            + where
            + f" ORDER BY {order_by} LIMIT :limit OFFSET :offset"
        ),
        {**params, "limit": limit, "offset": (page - 1) * limit},
    ).mappings().all()
    total = session.execute(
        text(f"SELECT COUNT(*) FROM migration_temp.users AS u{where}"),
        params,
    ).scalar_one()
    return rows, int(total)


def get_admin_user(session: Session, user_id: int):
    return session.execute(
        text("""
            SELECT id, login, mail, user_group, balance, banned,
                   created_at, last_seen_at, ban_reason, banned_by, banned_at
            FROM migration_temp.users
            WHERE id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id},
    ).mappings().first()


def get_user_social_accounts(session: Session, user_id: int):
    """Публичные данные привязок — без токенов и секретов (их и нет в БД)."""
    rows = session.execute(
        text("""
            SELECT provider, username, display_name, avatar_url,
                   created_at, updated_at
            FROM public.user_social_accounts
            WHERE user_id = :user_id
            ORDER BY created_at ASC
        """),
        {"user_id": user_id},
    ).mappings().all()
    return [
        {
            "provider": row["provider"],
            "username": row["username"],
            "display_name": row["display_name"],
            "avatar_url": row["avatar_url"],
            "connected_at": _iso(row["created_at"]),
            "updated_at": _iso(row["updated_at"]),
        }
        for row in rows
    ]


def get_user_orders(session: Session, user_id: int, *, limit: int = 10):
    rows = session.execute(
        text("""
            SELECT o.id, o.soc, o.service_id, o.link, o.qnt, o.amount,
                   o.status, o.date, o.supplier_cost, o.id_rocket
            FROM migration_temp.orders AS o
            WHERE o.user_id = :user_id
            ORDER BY o.id DESC
            LIMIT :limit
        """),
        {"user_id": user_id, "limit": limit},
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "platform": row["soc"],
            "service_id": row["service_id"],
            "link": row["link"],
            "quantity": row["qnt"],
            "amount": _money(row["amount"]),
            "supplier_cost": _money(row["supplier_cost"]),
            "status": row["status"],
            "created_at": row["date"],
            "supplier_order_id": row["id_rocket"] or None,
        }
        for row in rows
    ]


def get_user_tickets(session: Session, user_id: int, *, limit: int = 10):
    rows = session.execute(
        text("""
            SELECT id, public_id, subject, status, created_at, updated_at
            FROM migration_temp.support_tickets
            WHERE user_id = :user_id
            ORDER BY id DESC
            LIMIT :limit
        """),
        {"user_id": user_id, "limit": limit},
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "public_id": row["public_id"],
            "subject": row["subject"],
            "status": row["status"],
            "created_at": _iso(row["created_at"]),
            "updated_at": _iso(row["updated_at"]),
        }
        for row in rows
    ]


def get_user_reviews(session: Session, user_id: int):
    rows = session.execute(
        text("""
            SELECT id, rating, text, created_at, updated_at, deleted_at
            FROM migration_temp.reviews
            WHERE user_id = :user_id
            ORDER BY id DESC
        """),
        {"user_id": user_id},
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "rating": row["rating"],
            "text": row["text"],
            "created_at": _iso(row["created_at"]),
            "updated_at": _iso(row["updated_at"]),
            "deleted": row["deleted_at"] is not None,
        }
        for row in rows
    ]


def set_user_banned(
    session: Session,
    *,
    user_id: int,
    reason: str | None,
    admin_id: int,
) -> int | None:
    """Блокирует пользователя и инвалидирует все его JWT (token_version+1)."""
    return session.execute(
        text("""
            UPDATE migration_temp.users
            SET banned = 1,
                ban_reason = :reason,
                banned_by = :admin_id,
                banned_at = NOW(),
                token_version = token_version + 1
            WHERE id = :user_id
            RETURNING id
        """),
        {"user_id": user_id, "reason": reason, "admin_id": admin_id},
    ).scalar_one_or_none()


def set_user_unbanned(session: Session, *, user_id: int) -> int | None:
    return session.execute(
        text("""
            UPDATE migration_temp.users
            SET banned = 0,
                ban_reason = NULL,
                banned_by = NULL,
                banned_at = NULL
            WHERE id = :user_id
            RETURNING id
        """),
        {"user_id": user_id},
    ).scalar_one_or_none()


REVIEW_LIST_BASE = """
    SELECT r.id, r.user_id, r.rating, r.text, r.created_at, r.updated_at,
           r.deleted_at,
           COALESCE(NULLIF(u.login, ''), NULLIF(s.username, ''),
                    NULLIF(s.display_name, ''), 'ID ' || u.id::text) AS user_login
    FROM migration_temp.reviews AS r
    JOIN migration_temp.users AS u ON u.id = r.user_id
    LEFT JOIN LATERAL (
        SELECT username, display_name
        FROM public.user_social_accounts
        WHERE user_id = u.id ORDER BY id LIMIT 1
    ) AS s ON TRUE
"""

REVIEW_SORT = {
    "newest": "r.created_at DESC, r.id DESC",
    "oldest": "r.created_at ASC, r.id ASC",
    "highest": "r.rating DESC, r.id DESC",
    "lowest": "r.rating ASC, r.id ASC",
}


def serialize_review(row) -> dict:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "user_login": row["user_login"],
        "rating": row["rating"],
        "text": row["text"],
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "deleted": row["deleted_at"] is not None,
        "deleted_at": _iso(row["deleted_at"]),
    }


def list_admin_reviews(
    session: Session,
    *,
    page: int,
    limit: int,
    search: str | None,
    rating: int | None,
    deleted: str | None,
    sort: str,
):
    clauses = []
    params: dict = {}
    if search:
        clauses.append("(r.text ILIKE :search_like OR u.login ILIKE :search_like)")
        params["search_like"] = f"%{search}%"
    if rating is not None:
        clauses.append("r.rating = :rating")
        params["rating"] = rating
    if deleted == "active":
        clauses.append("r.deleted_at IS NULL")
    elif deleted == "deleted":
        clauses.append("r.deleted_at IS NOT NULL")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    order_by = REVIEW_SORT[sort]

    rows = session.execute(
        text(
            REVIEW_LIST_BASE
            + where
            + f" ORDER BY {order_by} LIMIT :limit OFFSET :offset"
        ),
        {**params, "limit": limit, "offset": (page - 1) * limit},
    ).mappings().all()
    total = session.execute(
        text(
            f"SELECT COUNT(*) FROM migration_temp.reviews AS r "
            f"JOIN migration_temp.users AS u ON u.id = r.user_id{where}"
        ),
        params,
    ).scalar_one()
    return rows, int(total)


def soft_delete_review(session: Session, *, review_id: int, admin_id: int) -> bool:
    """Мягкое удаление: отзыв остаётся в БД для восстановления."""
    return session.execute(
        text("""
            UPDATE migration_temp.reviews
            SET deleted_at = NOW(), deleted_by = :admin_id
            WHERE id = :review_id AND deleted_at IS NULL
            RETURNING id
        """),
        {"review_id": review_id, "admin_id": admin_id},
    ).scalar_one_or_none() is not None


def restore_review(session: Session, *, review_id: int, admin_id: int) -> bool:
    return session.execute(
        text("""
            UPDATE migration_temp.reviews
            SET deleted_at = NULL, deleted_by = :admin_id
            WHERE id = :review_id AND deleted_at IS NOT NULL
            RETURNING id
        """),
        {"review_id": review_id, "admin_id": admin_id},
    ).scalar_one_or_none() is not None


def list_audit_log(
    session: Session,
    *,
    page: int,
    limit: int,
    admin_id: int | None,
    action: str | None,
    entity_type: str | None,
    start_ts: datetime | None,
    end_ts: datetime | None,
    search: str | None,
):
    clauses = []
    params: dict = {}
    if admin_id is not None:
        clauses.append("a.admin_id = :admin_id")
        params["admin_id"] = admin_id
    if action:
        clauses.append("a.action = :action")
        params["action"] = action
    if entity_type:
        clauses.append("a.entity_type = :entity_type")
        params["entity_type"] = entity_type
    if search:
        clauses.append("a.entity_id ILIKE :search_like")
        params["search_like"] = f"%{search}%"
    if start_ts is not None:
        clauses.append("a.created_at >= :start_ts")
        params["start_ts"] = start_ts
    if end_ts is not None:
        clauses.append("a.created_at < :end_ts")
        params["end_ts"] = end_ts
    where = " WHERE " + " AND ".join(clauses) if clauses else ""

    rows = session.execute(
        text(
            "SELECT a.id, a.admin_id, a.action, a.entity_type, a.entity_id,"
            "       a.old_value, a.new_value, a.created_at,"
            "       COALESCE(NULLIF(u.login, ''), 'ID ' || u.id::text)"
            "           AS admin_login"
            " FROM migration_temp.admin_audit_log AS a"
            " LEFT JOIN migration_temp.users AS u ON u.id = a.admin_id"
            f"{where}"
            " ORDER BY a.created_at DESC, a.id DESC"
            " LIMIT :limit OFFSET :offset"
        ),
        {**params, "limit": limit, "offset": (page - 1) * limit},
    ).mappings().all()
    total = session.execute(
        text(
            "SELECT COUNT(*) FROM migration_temp.admin_audit_log AS a"
            f"{where}"
        ),
        params,
    ).scalar_one()
    return [
        {
            "id": row["id"],
            "admin_id": row["admin_id"],
            "admin_login": row["admin_login"],
            "action": row["action"],
            "entity_type": row["entity_type"],
            "entity_id": row["entity_id"],
            "old_value": row["old_value"],
            "new_value": row["new_value"],
            "created_at": _iso(row["created_at"]),
        }
        for row in rows
    ], int(total)


def dashboard_snapshot(session: Session, *, active_window_minutes: int) -> dict:
    """Агрегаты главной страницы. Всё считается в PostgreSQL (COUNT/SUM)."""
    users = session.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM migration_temp.users) AS users_total,
                (SELECT COUNT(*) FROM migration_temp.users
                 WHERE created_at IS NOT NULL
                   AND created_at >= date_trunc('day', NOW())) AS users_new_today,
                (SELECT COUNT(*) FROM migration_temp.users
                 WHERE created_at IS NOT NULL
                   AND created_at >= date_trunc('day', NOW()) - INTERVAL '7 days')
                    AS users_new_week,
                (SELECT COUNT(*) FROM migration_temp.users
                 WHERE created_at IS NOT NULL
                   AND created_at >= date_trunc('day', NOW()) - INTERVAL '30 days')
                    AS users_new_month,
                (SELECT COUNT(*) FROM migration_temp.users
                 WHERE last_seen_at IS NOT NULL
                   AND last_seen_at >= NOW() - (:window_minutes * INTERVAL '1 minute'))
                    AS users_active
        """),
        {"window_minutes": active_window_minutes},
    ).mappings().one()

    orders = session.execute(
        text(f"""
            SELECT
                (SELECT COUNT(*) FROM migration_temp.orders) AS orders_total,
                (SELECT COUNT(*) FROM migration_temp.orders AS o
                 LEFT JOIN LATERAL (
                     SELECT processed_at FROM migration_temp.payment_attempts
                     WHERE order_id = o.id AND status = 'processed'
                     ORDER BY id DESC LIMIT 1
                 ) AS p ON TRUE
                 WHERE {ORDER_TS} >= date_trunc('day', NOW())) AS orders_today,
                (SELECT COUNT(*) FROM migration_temp.orders
                 WHERE status IN ('Выполняется', 'Частично', 'Отправляется'))
                    AS orders_active,
                (SELECT COALESCE(SUM(o.amount), 0)
                 FROM migration_temp.orders AS o
                 LEFT JOIN LATERAL (
                     SELECT processed_at FROM migration_temp.payment_attempts
                     WHERE order_id = o.id AND status = 'processed'
                     ORDER BY id DESC LIMIT 1
                 ) AS p ON TRUE
                 WHERE {PAID_CLAUSE}) AS revenue_total,
                (SELECT COALESCE(SUM(o.amount), 0)
                 FROM migration_temp.orders AS o
                 LEFT JOIN LATERAL (
                     SELECT processed_at FROM migration_temp.payment_attempts
                     WHERE order_id = o.id AND status = 'processed'
                     ORDER BY id DESC LIMIT 1
                 ) AS p ON TRUE
                 WHERE {PAID_CLAUSE}
                   AND {ORDER_TS} >= date_trunc('day', NOW())) AS revenue_today,
                (SELECT COALESCE(SUM(o.amount), 0)
                 FROM migration_temp.orders AS o
                 LEFT JOIN LATERAL (
                     SELECT processed_at FROM migration_temp.payment_attempts
                     WHERE order_id = o.id AND status = 'processed'
                     ORDER BY id DESC LIMIT 1
                 ) AS p ON TRUE
                 WHERE {PAID_CLAUSE}
                   AND {ORDER_TS} >= date_trunc('day', NOW()) - INTERVAL '7 days')
                    AS revenue_week,
                (SELECT COALESCE(SUM(o.amount), 0)
                 FROM migration_temp.orders AS o
                 LEFT JOIN LATERAL (
                     SELECT processed_at FROM migration_temp.payment_attempts
                     WHERE order_id = o.id AND status = 'processed'
                     ORDER BY id DESC LIMIT 1
                 ) AS p ON TRUE
                 WHERE {PAID_CLAUSE}
                   AND {ORDER_TS} >= date_trunc('day', NOW()) - INTERVAL '30 days')
                    AS revenue_month
        """),
    ).mappings().one()

    support = session.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM migration_temp.support_tickets)
                    AS tickets_total,
                (SELECT COUNT(*) FROM migration_temp.support_tickets
                 WHERE status <> 'closed') AS tickets_open,
                (SELECT COUNT(*) FROM migration_temp.support_tickets
                 WHERE status = 'new') AS tickets_new
        """),
    ).mappings().one()

    reviews_total = session.execute(
        text("""
            SELECT COUNT(*) FROM migration_temp.reviews
            WHERE deleted_at IS NULL
        """),
    ).scalar_one()

    traffic = session.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM migration_temp.traffic_events
                 WHERE created_at >= date_trunc('day', NOW()))
                    AS pageviews_today,
                (SELECT COUNT(DISTINCT visitor_hash) FROM migration_temp.traffic_events
                 WHERE created_at >= date_trunc('day', NOW()))
                    AS uniques_today,
                (SELECT COUNT(DISTINCT user_id) FROM migration_temp.traffic_events
                 WHERE created_at >= date_trunc('day', NOW())
                   AND user_id IS NOT NULL) AS logged_in_today,
                (SELECT COUNT(*) FROM migration_temp.traffic_events
                 WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '7 days')
                    AS pageviews_week,
                (SELECT COUNT(*) FROM migration_temp.traffic_events
                 WHERE created_at >= date_trunc('day', NOW()) - INTERVAL '30 days')
                    AS pageviews_month
        """),
    ).mappings().one()

    return {
        "users": {
            "total": int(users["users_total"]),
            "new_today": int(users["users_new_today"]),
            "new_week": int(users["users_new_week"]),
            "new_month": int(users["users_new_month"]),
            "active": int(users["users_active"]),
        },
        "orders": {
            "total": int(orders["orders_total"]),
            "today": int(orders["orders_today"]),
            "active": int(orders["orders_active"]),
        },
        "revenue": {
            "total": _money(orders["revenue_total"]),
            "today": _money(orders["revenue_today"]),
            "week": _money(orders["revenue_week"]),
            "month": _money(orders["revenue_month"]),
        },
        "support": {
            "total": int(support["tickets_total"]),
            "open": int(support["tickets_open"]),
            "new": int(support["tickets_new"]),
        },
        "reviews_total": int(reviews_total),
        "traffic": {
            "pageviews_today": int(traffic["pageviews_today"]),
            "uniques_today": int(traffic["uniques_today"]),
            "logged_in_today": int(traffic["logged_in_today"]),
            "pageviews_week": int(traffic["pageviews_week"]),
            "pageviews_month": int(traffic["pageviews_month"]),
        },
    }


def revenue_series(
    session: Session,
    *,
    start_ts: datetime,
    end_ts: datetime,
    bucket: str,
):
    rows = session.execute(
        text(f"""
            SELECT date_trunc(:bucket, {ORDER_TS}) AS ts,
                   COUNT(*) AS orders_count,
                   COALESCE(SUM(o.amount), 0) AS revenue,
                   COALESCE(SUM(o.supplier_cost), 0) AS cost,
                   COUNT(o.supplier_cost) AS cost_known_orders
            FROM migration_temp.orders AS o
            LEFT JOIN LATERAL (
                SELECT processed_at FROM migration_temp.payment_attempts
                WHERE order_id = o.id AND status = 'processed'
                ORDER BY id DESC LIMIT 1
            ) AS p ON TRUE
            WHERE {PAID_CLAUSE}
              AND {ORDER_TS} >= :start_ts
              AND {ORDER_TS} < :end_ts
            GROUP BY ts
            ORDER BY ts
        """),
        {"bucket": bucket, "start_ts": start_ts, "end_ts": end_ts},
    ).mappings().all()
    return [
        {
            "ts": _iso(row["ts"]),
            "orders": int(row["orders_count"]),
            "revenue": _money(row["revenue"]),
            "cost": _money(row["cost"]),
            "cost_known_orders": int(row["cost_known_orders"]),
        }
        for row in rows
    ]


def users_series(
    session: Session,
    *,
    start_ts: datetime,
    end_ts: datetime,
    bucket: str,
):
    rows = session.execute(
        text("""
            SELECT date_trunc(:bucket, created_at) AS ts,
                   COUNT(*) AS registrations
            FROM migration_temp.users
            WHERE created_at IS NOT NULL
              AND created_at >= :start_ts
              AND created_at < :end_ts
            GROUP BY ts
            ORDER BY ts
        """),
        {"bucket": bucket, "start_ts": start_ts, "end_ts": end_ts},
    ).mappings().all()
    return [
        {"ts": _iso(row["ts"]), "registrations": int(row["registrations"])}
        for row in rows
    ]


def users_baseline(session: Session, start_ts: datetime) -> int:
    return int(
        session.execute(
            text("""
                SELECT COUNT(*) FROM migration_temp.users
                WHERE created_at IS NOT NULL AND created_at < :start_ts
            """),
            {"start_ts": start_ts},
        ).scalar_one()
    )


def active_users_count(session: Session, *, window_minutes: int) -> int:
    return int(
        session.execute(
            text("""
                SELECT COUNT(*) FROM migration_temp.users
                WHERE last_seen_at IS NOT NULL
                  AND last_seen_at >= NOW() - (:window_minutes * INTERVAL '1 minute')
            """),
            {"window_minutes": window_minutes},
        ).scalar_one()
    )


def traffic_series(
    session: Session,
    *,
    start_ts: datetime,
    end_ts: datetime,
    bucket: str,
):
    rows = session.execute(
        text("""
            SELECT date_trunc(:bucket, created_at) AS ts,
                   COUNT(*) AS pageviews,
                   COUNT(DISTINCT visitor_hash) AS unique_visitors,
                   COUNT(DISTINCT user_id) AS logged_in_users
            FROM migration_temp.traffic_events
            WHERE created_at >= :start_ts
              AND created_at < :end_ts
            GROUP BY ts
            ORDER BY ts
        """),
        {"bucket": bucket, "start_ts": start_ts, "end_ts": end_ts},
    ).mappings().all()
    return [
        {
            "ts": _iso(row["ts"]),
            "pageviews": int(row["pageviews"]),
            "unique_visitors": int(row["unique_visitors"]),
            "logged_in_users": int(row["logged_in_users"]),
        }
        for row in rows
    ]


def finance_summary(
    session: Session,
    *,
    start_ts: datetime,
    end_ts: datetime,
) -> dict:
    """Финансовые агрегаты за период. Всё считается на стороне БД."""

    orders = session.execute(
        text(f"""
            SELECT COUNT(*) AS paid_orders_count,
                   COALESCE(SUM(o.amount), 0) AS paid_orders_sum,
                   COALESCE(SUM(o.supplier_cost), 0) AS cost_sum,
                   COUNT(o.supplier_cost) AS cost_known_orders
            FROM migration_temp.orders AS o
            LEFT JOIN LATERAL (
                SELECT processed_at FROM migration_temp.payment_attempts
                WHERE order_id = o.id AND status = 'processed'
                ORDER BY id DESC LIMIT 1
            ) AS p ON TRUE
            WHERE {PAID_CLAUSE}
              AND {ORDER_TS} >= :start_ts
              AND {ORDER_TS} < :end_ts
        """),
        {"start_ts": start_ts, "end_ts": end_ts},
    ).mappings().one()

    # Пополнения: обработанные попытки новой схемы + legacy-транзакции,
    # не привязанные к попыткам (исключает двойной учёт).
    topups = session.execute(
        text("""
            SELECT
                (SELECT COALESCE(SUM(amount), 0)
                 FROM migration_temp.payment_attempts
                 WHERE purpose = 'balance_topup'
                   AND status = 'processed'
                   AND processed_at >= :start_ts
                   AND processed_at < :end_ts) AS attempt_sum,
                (SELECT COUNT(*)
                 FROM migration_temp.payment_attempts
                 WHERE purpose = 'balance_topup'
                   AND status = 'processed'
                   AND processed_at >= :start_ts
                   AND processed_at < :end_ts) AS attempt_count,
                (SELECT COALESCE(SUM(t.amount), 0)
                 FROM migration_temp."transaction" AS t
                 WHERE t.method IN ('yookassa', 'crystal', 'crystalpay', 'heleket')
                   AND t.amount > 0
                   AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') >= :start_ts
                   AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') < :end_ts
                   AND NOT EXISTS (
                       SELECT 1 FROM migration_temp.payment_attempts AS a
                       WHERE a.transaction_id = t.id
                   )) AS legacy_sum,
                (SELECT COUNT(*)
                 FROM migration_temp."transaction" AS t
                 WHERE t.method IN ('yookassa', 'crystal', 'crystalpay', 'heleket')
                   AND t.amount > 0
                   AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') >= :start_ts
                   AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') < :end_ts
                   AND NOT EXISTS (
                       SELECT 1 FROM migration_temp.payment_attempts AS a
                       WHERE a.transaction_id = t.id
                   )) AS legacy_count
        """),
        {"start_ts": start_ts, "end_ts": end_ts},
    ).mappings().one()

    refunds = session.execute(
        text("""
            SELECT COALESCE(SUM(-t.amount), 0) AS refunds_sum, COUNT(*)
            FROM migration_temp."transaction" AS t
            WHERE t.method = 'admin'
              AND t.amount < 0
              AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') >= :start_ts
              AND TO_TIMESTAMP(t.date, 'HH24:MI:SS DD.MM.YYYY') < :end_ts
        """),
        {"start_ts": start_ts, "end_ts": end_ts},
    ).mappings().one()

    paid_orders_sum = orders["paid_orders_sum"]
    paid_orders_count = int(orders["paid_orders_count"])
    cost_sum = orders["cost_sum"]
    cost_known = int(orders["cost_known_orders"])
    topup_attempts_sum = topups["attempt_sum"] or 0
    topup_attempts_count = int(topups["attempt_count"] or 0)
    legacy_topups_sum = topups["legacy_sum"] or 0
    legacy_topups_count = int(topups["legacy_count"] or 0)
    topups_sum = topup_attempts_sum + legacy_topups_sum
    topups_count = topup_attempts_count + legacy_topups_count
    turnover = paid_orders_sum + topups_sum

    # Маржа считается только по заказам с известной себестоимостью:
    # для legacy-заказов без supplier_cost прибыль вычислить честно нельзя.
    profit = paid_orders_sum - cost_sum
    margin = (
        (profit / paid_orders_sum * 100)
        if paid_orders_sum and cost_known > 0
        else None
    )

    return {
        "paid_orders_count": paid_orders_count,
        "paid_orders_sum": _money(paid_orders_sum),
        "avg_check": _money(paid_orders_sum / paid_orders_count)
        if paid_orders_count
        else None,
        "topups_sum": _money(topups_sum),
        "topups_count": topups_count,
        "refunds_sum": _money(refunds["refunds_sum"]),
        "turnover": _money(turnover),
        "cost_sum": _money(cost_sum),
        "cost_known_orders": cost_known,
        "profit": _money(profit),
        "margin_percent": float(margin) if margin is not None else None,
    }
