"""Пользовательское REST API поддержки: /api/support/*."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from backend.auth.dependencies import get_current_user
from backend.core import config

from . import notifications
from .schemas import CreateTicketRequest, SendMessageRequest
from .service import SupportService, TicketClosedError, TicketNotFoundError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/support", tags=["Поддержка"])


def _user_display(user: dict) -> str:
    login = (user.get("login") or "").strip()
    return login or f"ID {user['id']}"


def _is_admin(user: dict) -> bool:
    return int(user["id"]) in config.ADMIN_USER_IDS


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
def create_ticket_endpoint(
    data: CreateTicketRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = SupportService.create_ticket(
            user_id=current_user["id"],
            subject=data.subject,
            message=data.message,
            contact=data.contact,
        )
    except Exception:
        logger.exception("Support ticket creation failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось создать обращение. Попробуйте ещё раз.",
        )

    # Уведомление отправляем ПОСЛЕ commit — его ошибка не откатывает тикет.
    background_tasks.add_task(
        notifications.send_new_ticket_notification,
        internal_ticket_id=result["internal_ticket_id"],
        public_id=result["ticket"]["public_id"],
        subject=result["ticket"]["subject"],
        description=result["first_message"]["message"],
        contact=result["ticket"]["contact"],
        user_login=_user_display(current_user),
        first_message_id=result["first_message"]["id"],
    )
    return result["ticket"]


@router.get("/tickets")
def list_tickets_endpoint(current_user: dict = Depends(get_current_user)):
    return {"items": SupportService.list_my_tickets(user_id=current_user["id"])}


@router.get("/tickets/{public_id}")
def get_ticket_endpoint(
    public_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        return SupportService.get_ticket(
            public_id=public_id,
            user_id=current_user["id"],
            is_admin=_is_admin(current_user),
        )
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")


@router.post("/tickets/{public_id}/messages")
def send_message_endpoint(
    public_id: str,
    data: SendMessageRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = SupportService.send_user_message(
            public_id=public_id,
            user_id=current_user["id"],
            message=data.message,
        )
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    except TicketClosedError:
        raise HTTPException(status_code=409, detail="Обращение закрыто")

    background_tasks.add_task(
        notifications.send_new_user_reply_notification,
        internal_ticket_id=result["internal_ticket_id"],
        public_id=result["ticket"]["public_id"],
        user_login=_user_display(current_user),
        message=result["message"]["message"],
        support_message_id=result["message"]["id"],
    )
    return {"message": result["message"], "ticket": result["ticket"]}


@router.post("/tickets/{public_id}/close")
def close_ticket_endpoint(
    public_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        return SupportService.close_ticket(public_id=public_id, user_id=current_user["id"])
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
