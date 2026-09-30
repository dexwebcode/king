"""HTTP-слой внутренней аналитики.

POST /api/analytics/track — публичный beacon без обязательной авторизации.
Если в запросе есть валидный JWT, к событию прикрепляется только user_id
(для статистики авторизованных посетителей); никакие данные пользователя
не сохраняются. События собираются разумно: открытие страницы, не движение мыши.
"""

import logging

from fastapi import APIRouter, Header, Request, status

from backend.auth.security import decode_access_token
from backend.core.config import RATE_LIMIT_TRAFFIC_PER_IP
from backend.core.database import SessionLocal
from backend.core.ratelimit import client_ip, enforce_rate_limits

from .schemas import TrackEventRequest
from .service import hash_visitor, record_event

router = APIRouter(prefix="/api/analytics", tags=["Аналитика"])
logger = logging.getLogger(__name__)


def _authenticated_user_id(authorization: str | None) -> int | None:
    """Best-effort user_id из JWT: невалидный токен не роняет beacon."""
    if not authorization:
        return None
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        return None
    decoded = decode_access_token(token)
    return decoded[0] if decoded is not None else None


@router.post("/track", status_code=status.HTTP_204_NO_CONTENT)
def track_event(
    data: TrackEventRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    enforce_rate_limits(
        [(f"traffic:ip:{client_ip(request)}", RATE_LIMIT_TRAFFIC_PER_IP)]
    )
    user_id = _authenticated_user_id(authorization)
    session = SessionLocal()
    try:
        with session.begin():
            record_event(
                session,
                visitor_hash=hash_visitor(data.visitor_id),
                user_id=user_id,
                event_type=data.event_type,
                path=data.path,
            )
    finally:
        session.close()
    return None
