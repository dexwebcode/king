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
    visitor_hash: str | None,
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


# Способы входа/регистрации, которые пишет backend (в поле path).
LOGIN_PASSWORD = "/login/password"
LOGIN_TELEGRAM = "/login/telegram"
LOGIN_VK = "/login/vk"
REGISTER_PASSWORD = "/register/password"
REGISTER_TELEGRAM = "/register/telegram"
REGISTER_VK = "/register/vk"


def record_auth_event(
    session: Session,
    *,
    user_id: int,
    event_type: str,
    source: str,
) -> None:
    """Фиксирует вход или регистрацию.

    Событие пишет только backend после успешной проверки учётных данных,
    поэтому эти данные нельзя подделать из браузера. visitor_hash не
    заполняется: вход привязан к конкретному user_id.
    """
    record_event(
        session,
        visitor_hash=None,
        user_id=user_id,
        event_type=event_type,
        path=source,
    )
