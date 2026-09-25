"""Административное REST API поддержки: /api/admin/support/*."""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.admin.dependencies import get_current_admin

from .constants import VALID_STATUS_VALUES
from .schemas import AdminSendMessageRequest, StatusUpdateRequest
from .service import SupportService, TicketClosedError, TicketNotFoundError

router = APIRouter(
    prefix="/api/admin/support",
    tags=["Поддержка (админ)"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("/tickets")
def admin_list_tickets_endpoint(
    status: str | None = Query(default=None),
    user_id: int | None = Query(default=None, ge=1),
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    if status is not None and status not in VALID_STATUS_VALUES:
        raise HTTPException(status_code=422, detail="Недопустимый статус обращения")
    search = (search or "").strip() or None
    return SupportService.admin_list_tickets(
        status=status,
        user_id=user_id,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{public_id}")
def admin_get_ticket_endpoint(public_id: str):
    try:
        return SupportService.get_ticket(public_id=public_id, is_admin=True)
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")


@router.post("/tickets/{public_id}/messages")
def admin_send_message_endpoint(
    public_id: str,
    data: AdminSendMessageRequest,
    current_user: dict = Depends(get_current_admin),
):
    try:
        return SupportService.admin_send_message(
            public_id=public_id,
            admin_user_id=current_user["id"],
            message=data.message,
        )
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    except TicketClosedError:
        raise HTTPException(status_code=409, detail="Обращение закрыто")


@router.patch("/tickets/{public_id}/status")
def admin_change_status_endpoint(
    public_id: str,
    data: StatusUpdateRequest,
    current_user: dict = Depends(get_current_admin),
):
    try:
        return SupportService.admin_change_status(
            public_id=public_id,
            admin_user_id=current_user["id"],
            status=data.status,
        )
    except TicketNotFoundError:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
