"""Бизнес-логика поддержки. Единая для REST API и Telegram-бота."""

import logging
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError

from backend.core.database import SessionLocal

from . import repository
from .constants import (
    SupportSenderType,
    SupportTicketStatus,
    status_label,
)

logger = logging.getLogger(__name__)


class TicketNotFoundError(Exception):
    pass


class TicketClosedError(Exception):
    pass


def _utcnow():
    return datetime.now(timezone.utc)


def _generate_subject(message: str, limit: int = 120) -> str:
    words = message.split()
    subject = " ".join(words[:8])
    if len(subject) > limit:
        subject = subject[:limit].rstrip() + "…"
    return subject or "Обращение в поддержку"


def _ticket_payload(ticket, *, for_admin=False):
    data = {
        "public_id": ticket["public_id"],
        "subject": ticket["subject"],
        "status": ticket["status"],
        "status_label": status_label(ticket["status"]),
        "created_at": ticket["created_at"],
        "updated_at": ticket["updated_at"],
        "closed_at": ticket["closed_at"],
        "contact": ticket["contact"],
    }
    if for_admin:
        data.update(
            {
                "id": ticket["id"],
                "user_id": ticket["user_id"],
                "user_login": ticket.get("user_login"),
                "description": ticket["description"],
                "assigned_admin_id": ticket.get("assigned_admin_id"),
                "last_message": ticket.get("last_message"),
                "last_sender_type": ticket.get("last_sender_type"),
                "last_message_at": ticket.get("last_message_at"),
                "message_count": ticket.get("message_count"),
            }
        )
    return data


def _message_payload(message):
    return {
        "id": message["id"],
        "sender_type": message["sender_type"],
        "message": message["message"],
        "created_at": message["created_at"],
    }


class SupportService:
    @staticmethod
    def create_ticket(*, user_id, subject, message, contact):
        subject = subject or _generate_subject(message)
        session = SessionLocal()
        try:
            with session.begin():
                ticket = repository.insert_ticket(
                    session,
                    user_id=user_id,
                    subject=subject,
                    description=message,
                    contact=contact,
                )
                first_message = repository.insert_message(
                    session,
                    ticket_id=ticket["id"],
                    sender_type=SupportSenderType.USER.value,
                    sender_user_id=user_id,
                    message=message,
                )
        except SQLAlchemyError:
            raise
        finally:
            session.close()
        logger.info(
            "Support ticket created public_id=%s user_id=%s",
            ticket["public_id"],
            user_id,
        )
        return {
            "ticket": _ticket_payload(ticket),
            "first_message": _message_payload(first_message),
            "internal_ticket_id": ticket["id"],
        }

    @staticmethod
    def list_my_tickets(*, user_id, limit=50, before_public_id=None):
        session = SessionLocal()
        try:
            rows = repository.list_tickets_for_user(
                session,
                user_id,
                limit=limit,
                before_public_id=before_public_id,
            )
        finally:
            session.close()
        return [_ticket_payload(row) for row in rows]

    @staticmethod
    def get_ticket(*, public_id, user_id=None, is_admin=False):
        session = SessionLocal()
        try:
            ticket = repository.get_ticket_by_public_id(session, public_id)
            if ticket is None:
                raise TicketNotFoundError(public_id)
            if not is_admin and int(ticket["user_id"]) != int(user_id):
                raise TicketNotFoundError(public_id)
            messages = repository.list_messages(session, ticket["id"])
        finally:
            session.close()
        payload = _ticket_payload(ticket, for_admin=is_admin)
        payload["messages"] = [_message_payload(message) for message in messages]
        return payload

    @staticmethod
    def get_ticket_by_internal_id(*, ticket_id):
        session = SessionLocal()
        try:
            ticket = repository.get_ticket_by_id(session, ticket_id)
        finally:
            session.close()
        return _ticket_payload(ticket) if ticket else None

    @staticmethod
    def get_ticket_admin_context(*, ticket_id):
        """Расширенный контекст тикета для Telegram (с логином пользователя)."""
        session = SessionLocal()
        try:
            row = repository.get_ticket_admin_context(session, ticket_id)
        finally:
            session.close()
        return dict(row) if row else None

    @staticmethod
    def get_ticket_by_telegram_message_id(*, telegram_message_id):
        session = SessionLocal()
        try:
            ticket = repository.get_ticket_by_telegram_message_id(session, telegram_message_id)
        finally:
            session.close()
        return _ticket_payload(ticket) if ticket else None

    @staticmethod
    def send_user_message(*, public_id, user_id, message):
        session = SessionLocal()
        try:
            with session.begin():
                ticket = repository.get_ticket_by_public_id(session, public_id, for_update=True)
                if ticket is None or int(ticket["user_id"]) != int(user_id):
                    raise TicketNotFoundError(public_id)
                if ticket["status"] == SupportTicketStatus.CLOSED.value:
                    raise TicketClosedError(public_id)
                saved = repository.insert_message(
                    session,
                    ticket_id=ticket["id"],
                    sender_type=SupportSenderType.USER.value,
                    sender_user_id=user_id,
                    message=message,
                )
                updated = repository.update_ticket_status(
                    session,
                    ticket_id=ticket["id"],
                    status=SupportTicketStatus.IN_PROGRESS.value,
                    closed_at=None,
                )
        finally:
            session.close()
        logger.info("Support reply created public_id=%s", public_id)
        return {
            "message": _message_payload(saved),
            "ticket": _ticket_payload(updated),
            "internal_ticket_id": ticket["id"],
        }

    @staticmethod
    def close_ticket(*, public_id, user_id):
        session = SessionLocal()
        try:
            with session.begin():
                ticket = repository.get_ticket_by_public_id(session, public_id, for_update=True)
                if ticket is None or int(ticket["user_id"]) != int(user_id):
                    raise TicketNotFoundError(public_id)
                if ticket["status"] == SupportTicketStatus.CLOSED.value:
                    updated = ticket
                else:
                    updated = repository.update_ticket_status(
                        session,
                        ticket_id=ticket["id"],
                        status=SupportTicketStatus.CLOSED.value,
                        closed_at=_utcnow(),
                    )
                    repository.insert_message(
                        session,
                        ticket_id=ticket["id"],
                        sender_type=SupportSenderType.SYSTEM.value,
                        sender_user_id=None,
                        message="Обращение закрыто пользователем.",
                    )
        finally:
            session.close()
        logger.info("Support ticket closed public_id=%s", public_id)
        return {"ticket": _ticket_payload(updated)}

    @staticmethod
    def admin_list_tickets(*, status=None, user_id=None, search=None, limit=50, offset=0):
        session = SessionLocal()
        try:
            rows, total = repository.list_tickets_admin(
                session,
                status=status,
                user_id=user_id,
                search=search,
                limit=limit,
                offset=offset,
            )
        finally:
            session.close()
        return {"items": [_ticket_payload(row, for_admin=True) for row in rows], "total": total}

    @staticmethod
    def admin_send_message(*, public_id, admin_user_id, message, telegram_message_id=None):
        session = SessionLocal()
        try:
            with session.begin():
                ticket = repository.get_ticket_by_public_id(session, public_id, for_update=True)
                if ticket is None:
                    raise TicketNotFoundError(public_id)
                if ticket["status"] == SupportTicketStatus.CLOSED.value:
                    raise TicketClosedError(public_id)
                saved = repository.insert_message(
                    session,
                    ticket_id=ticket["id"],
                    sender_type=SupportSenderType.ADMIN.value,
                    sender_user_id=admin_user_id,
                    message=message,
                    telegram_message_id=telegram_message_id,
                )
                updated = repository.update_ticket_status(
                    session,
                    ticket_id=ticket["id"],
                    status=SupportTicketStatus.WAITING_USER.value,
                    closed_at=None,
                    assigned_admin_id=admin_user_id,
                )
        finally:
            session.close()
        logger.info("Support admin reply created public_id=%s", public_id)
        return {
            "message": _message_payload(saved),
            "ticket": _ticket_payload(updated),
            "ticket_user_id": ticket["user_id"],
        }

    @staticmethod
    def admin_change_status(*, public_id, admin_user_id, status):
        session = SessionLocal()
        try:
            with session.begin():
                ticket = repository.get_ticket_by_public_id(session, public_id, for_update=True)
                if ticket is None:
                    raise TicketNotFoundError(public_id)
                old_status = ticket["status"]
                if old_status == status:
                    updated = ticket
                else:
                    closed_at = _utcnow() if status == SupportTicketStatus.CLOSED.value else None
                    updated = repository.update_ticket_status(
                        session,
                        ticket_id=ticket["id"],
                        status=status,
                        closed_at=closed_at,
                        assigned_admin_id=admin_user_id,
                    )
                    if status == SupportTicketStatus.CLOSED.value:
                        system_text = "Обращение закрыто."
                    elif old_status == SupportTicketStatus.CLOSED.value:
                        system_text = "Обращение открыто повторно."
                    else:
                        system_text = (
                            f"Статус изменён с «{status_label(old_status, for_admin=True)}» "
                            f"на «{status_label(status, for_admin=True)}»."
                        )
                    repository.insert_message(
                        session,
                        ticket_id=ticket["id"],
                        sender_type=SupportSenderType.SYSTEM.value,
                        sender_user_id=None,
                        message=system_text,
                    )
        finally:
            session.close()
        logger.info(
            "Support ticket status changed public_id=%s status=%s",
            public_id,
            status,
        )
        return {"ticket": _ticket_payload(updated)}
