"""Сырые SQL-запросы к PostgreSQL для обращений поддержки."""

from sqlalchemy import text
from sqlalchemy.orm import Session

PUBLIC_ID_PREFIX = "SUP-"
PUBLIC_ID_PADDING = 6


def normalize_public_id(value: str) -> str:
    return str(value or "").strip().upper()


def insert_ticket(session, *, user_id, subject, description, contact):
    return session.execute(
        text("""
            INSERT INTO migration_temp.support_tickets
                (public_id, user_id, subject, description, contact, status)
            VALUES (
                :prefix || LPAD(nextval('migration_temp.support_ticket_seq')::text, :padding, '0'),
                :user_id, :subject, :description, :contact, 'new'
            )
            RETURNING id, public_id, user_id, subject, description, contact,
                      status, assigned_admin_id, created_at, updated_at, closed_at
        """),
        {
            "prefix": PUBLIC_ID_PREFIX,
            "padding": PUBLIC_ID_PADDING,
            "user_id": user_id,
            "subject": subject,
            "description": description,
            "contact": contact,
        },
    ).mappings().one()


def insert_message(session, *, ticket_id, sender_type, sender_user_id, message, telegram_message_id=None):
    return session.execute(
        text("""
            INSERT INTO migration_temp.support_messages
                (ticket_id, sender_type, sender_user_id, message, telegram_message_id)
            VALUES (:ticket_id, :sender_type, :sender_user_id, :message, :telegram_message_id)
            RETURNING id, ticket_id, sender_type, sender_user_id, message, created_at, telegram_message_id
        """),
        {
            "ticket_id": ticket_id,
            "sender_type": sender_type,
            "sender_user_id": sender_user_id,
            "message": message,
            "telegram_message_id": telegram_message_id,
        },
    ).mappings().one()


def get_ticket_by_id(session, ticket_id, *, for_update=False):
    lock = "FOR UPDATE" if for_update else ""
    return session.execute(
        text(f"""
            SELECT id, public_id, user_id, subject, description, contact,
                   status, assigned_admin_id, created_at, updated_at, closed_at
            FROM migration_temp.support_tickets
            WHERE id = :ticket_id
            {lock}
            LIMIT 1
        """),
        {"ticket_id": ticket_id},
    ).mappings().first()


def get_ticket_by_public_id(session, public_id, *, for_update=False):
    lock = "FOR UPDATE" if for_update else ""
    return session.execute(
        text(f"""
            SELECT id, public_id, user_id, subject, description, contact,
                   status, assigned_admin_id, created_at, updated_at, closed_at
            FROM migration_temp.support_tickets
            WHERE public_id = :public_id
            {lock}
            LIMIT 1
        """),
        {"public_id": normalize_public_id(public_id)},
    ).mappings().first()


def list_tickets_for_user(session, user_id, *, limit=50, before_public_id=None):
    """Страница тикетов пользователя (keyset по public_id DESC).

    public_id — нумерация с фиксированным паддингом, поэтому лексикографический
    порядок совпадает с порядком создания.
    """
    return session.execute(
        text("""
            SELECT id, public_id, user_id, subject, description, contact,
                   status, assigned_admin_id, created_at, updated_at, closed_at
            FROM migration_temp.support_tickets
            WHERE user_id = :user_id
              AND (:before_public_id IS NULL OR public_id < :before_public_id)
            ORDER BY public_id DESC
            LIMIT :limit
        """),
        {"user_id": user_id, "before_public_id": before_public_id, "limit": limit},
    ).mappings().all()


def list_messages(session, ticket_id):
    return session.execute(
        text("""
            SELECT id, ticket_id, sender_type, sender_user_id, message, created_at, telegram_message_id
            FROM migration_temp.support_messages
            WHERE ticket_id = :ticket_id
            ORDER BY id ASC
        """),
        {"ticket_id": ticket_id},
    ).mappings().all()


def update_ticket_status(session, *, ticket_id, status, closed_at=None, assigned_admin_id=None):
    return session.execute(
        text("""
            UPDATE migration_temp.support_tickets
            SET status = :status,
                closed_at = :closed_at,
                assigned_admin_id = COALESCE(:assigned_admin_id, assigned_admin_id),
                updated_at = NOW()
            WHERE id = :ticket_id
            RETURNING id, public_id, user_id, subject, description, contact,
                      status, assigned_admin_id, created_at, updated_at, closed_at
        """),
        {
            "ticket_id": ticket_id,
            "status": status,
            "closed_at": closed_at,
            "assigned_admin_id": assigned_admin_id,
        },
    ).mappings().one()


def link_telegram_message(session, *, support_message_id, telegram_message_id):
    session.execute(
        text("""
            UPDATE migration_temp.support_messages
            SET telegram_message_id = :telegram_message_id
            WHERE id = :support_message_id
        """),
        {"support_message_id": support_message_id, "telegram_message_id": telegram_message_id},
    )


def get_ticket_by_telegram_message_id(session, telegram_message_id):
    return session.execute(
        text("""
            SELECT t.id, t.public_id, t.user_id, t.subject, t.description, t.contact,
                   t.status, t.assigned_admin_id, t.created_at, t.updated_at, t.closed_at
            FROM migration_temp.support_messages AS m
            JOIN migration_temp.support_tickets AS t ON t.id = m.ticket_id
            WHERE m.telegram_message_id = :telegram_message_id
            LIMIT 1
        """),
        {"telegram_message_id": telegram_message_id},
    ).mappings().first()


def list_tickets_admin(session, *, status=None, user_id=None, search=None, limit=50, offset=0):
    clauses = []
    params = {}
    if status:
        clauses.append("t.status = :status")
        params["status"] = status
    if user_id is not None:
        clauses.append("t.user_id = :user_id")
        params["user_id"] = user_id
    if search:
        clauses.append(
            "(t.public_id ILIKE :search OR t.subject ILIKE :search "
            "OR t.description ILIKE :search OR COALESCE(u.login, '') ILIKE :search)"
        )
        params["search"] = f"%{search}%"
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params["limit"] = limit
    params["offset"] = offset

    rows = session.execute(
        text(f"""
            SELECT t.id, t.public_id, t.user_id, t.subject, t.description, t.contact,
                   t.status, t.assigned_admin_id, t.created_at, t.updated_at, t.closed_at,
                   COALESCE(NULLIF(u.login, ''), 'ID ' || u.id::text) AS user_login,
                   lm.message AS last_message,
                   lm.sender_type AS last_sender_type,
                   lm.created_at AS last_message_at,
                   (SELECT COUNT(*) FROM migration_temp.support_messages m WHERE m.ticket_id = t.id) AS message_count
            FROM migration_temp.support_tickets AS t
            JOIN migration_temp.users AS u ON u.id = t.user_id
            LEFT JOIN LATERAL (
                SELECT m.message, m.sender_type, m.created_at
                FROM migration_temp.support_messages AS m
                WHERE m.ticket_id = t.id
                ORDER BY m.id DESC
                LIMIT 1
            ) AS lm ON TRUE
            {where}
            ORDER BY t.updated_at DESC, t.id DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).mappings().all()

    total = session.execute(
        text(f"""
            SELECT COUNT(*)
            FROM migration_temp.support_tickets AS t
            JOIN migration_temp.users AS u ON u.id = t.user_id
            {where}
        """),
        {key: value for key, value in params.items() if key not in ("limit", "offset")},
    ).scalar_one()
    return rows, total


def get_ticket_admin_context(session, ticket_id):
    return session.execute(
        text("""
            SELECT t.id, t.public_id, t.user_id, t.subject, t.description, t.contact,
                   t.status, t.assigned_admin_id, t.created_at, t.updated_at, t.closed_at,
                   COALESCE(NULLIF(u.login, ''), NULLIF(u.mail, ''), 'ID ' || u.id::text) AS user_login
            FROM migration_temp.support_tickets AS t
            JOIN migration_temp.users AS u ON u.id = t.user_id
            WHERE t.id = :ticket_id
            LIMIT 1
        """),
        {"ticket_id": ticket_id},
    ).mappings().first()
