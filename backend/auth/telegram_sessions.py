# ФАЙЛ: backend/auth/telegram_sessions.py
#
# Содержит функции для создания, хранения, получения и подтверждения
# временных Telegram-сессий авторизации.

# PYTHON ИМПОРТЫ
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.core.config import (
    TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES,
    TELEGRAM_BOT_USERNAME,
)


# Создаёт SHA-256 хеш токена для хранения в базе данных.
def hash_telegram_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# Создаёт таблицу временных Telegram-сессий, если она ещё не существует.
def ensure_telegram_auth_sessions_table(session: Session) -> None:
    session.execute(
        text("""
            CREATE TABLE IF NOT EXISTS public.telegram_auth_sessions (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT,
                token_hash CHAR(64) NOT NULL UNIQUE,
                telegram_id BIGINT,
                telegram_username TEXT,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
    )
    # Поддерживаем guest-сессии без привязки к существующему пользователю.
    session.execute(
        text("""
            ALTER TABLE public.telegram_auth_sessions
            ALTER COLUMN user_id DROP NOT NULL
        """)
    )
    session.commit()


# Создаёт новую временную Telegram-сессию и возвращает токен для frontend.
def create_telegram_auth_session(
    session: Session,
    user_id: int | None,
) -> dict:
    ensure_telegram_auth_sessions_table(session)

    # Генерируем одноразовый токен и сохраняем только его хеш.
    token = secrets.token_urlsafe(32)
    token_hash = hash_telegram_session_token(token)
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES
    )
    # Удаляем истёкшие сессии перед созданием новой.
    session.execute(
    text("""
        DELETE FROM public.telegram_auth_sessions
        WHERE expires_at < NOW()
    """)
)
    # Сохраняем ожидающую подтверждения Telegram-сессию.
    session.execute(
        text("""
            INSERT INTO public.telegram_auth_sessions (
                user_id,
                token_hash,
                expires_at
            )
            VALUES (
                :user_id,
                :token_hash,
                :expires_at
            )
        """),
        {
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": expires_at,
        },
    )
    session.commit()

    # Формируем ссылку на бота, если его username настроен.
    bot_url = None

    if TELEGRAM_BOT_USERNAME:
        bot_url = f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={token}"

    return {
        "token": token,
        "bot_url": bot_url,
        "expires_at": expires_at.isoformat(),
    }


# Получает Telegram-сессию по токену без изменения её состояния.
def get_telegram_auth_session(
    session: Session,
    token: str,
):
    ensure_telegram_auth_sessions_table(session)

    # Ищем в базе хеш токена, а не исходное значение.
    token_hash = hash_telegram_session_token(token)

    result = session.execute(
        text("""
            SELECT
                user_id,
                telegram_id,
                telegram_username,
                status,
                expires_at,
                used_at
            FROM public.telegram_auth_sessions
            WHERE token_hash = :token_hash
            LIMIT 1
        """),
        {
            "token_hash": token_hash,
        },
    )

    return result.mappings().first()


# Подтверждает ожидающую Telegram-сессию данными, полученными от бота.
def complete_telegram_auth_session(
    session: Session,
    token: str,
    telegram_id: int,
    telegram_username: str | None,
):
    ensure_telegram_auth_sessions_table(session)

    # Обновляем только неиспользованную и неистёкшую сессию.
    token_hash = hash_telegram_session_token(token)

    result = session.execute(
        text("""
            UPDATE public.telegram_auth_sessions
            SET
                telegram_id = :telegram_id,
                telegram_username = :telegram_username,
                status = 'authorized',
                used_at = NOW()
            WHERE token_hash = :token_hash
              AND status = 'pending'
              AND expires_at > NOW()
            RETURNING user_id
                , telegram_id
                , telegram_username
        """),
        {
            "telegram_id": telegram_id,
            "telegram_username": telegram_username,
            "token_hash": token_hash,
        },
    )

    # RETURNING вернёт строку только для успешно подтверждённой сессии.
    session_row = result.mappings().first()
    session.commit()

    return session_row
