"""Запись событий посещений во внутреннюю аналитику."""

import hashlib
import hmac
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.config import SECRET_KEY

logger = logging.getLogger(__name__)


def hash_visitor(visitor_id: str) -> str:
    """Односторонний хеш клиентского анонимного ID.

    Клиент генерирует случайный UUID и хранит его в localStorage; сервер
    сохраняет только HMAC, поэтому исходное значение восстановить нельзя,
    а уникальные посетители считаются по стабильному хешу.
    """
    digest = hmac.new(
        SECRET_KEY.encode("utf-8"),
        str(visitor_id).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:48]


def record_event(
    session: Session,
    *,
    visitor_hash: str,
    user_id: int | None,
    event_type: str,
    path: str,
) -> None:
    session.execute(
        text("""
            INSERT INTO migration_temp.traffic_events (
                visitor_hash, user_id, event_type, path
            ) VALUES (
                :visitor_hash, :user_id, :event_type, :path
            )
        """),
        {
            "visitor_hash": visitor_hash,
            "user_id": user_id,
            "event_type": str(event_type)[:32],
            "path": (str(path) or "")[:300],
        },
    )
