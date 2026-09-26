"""Общий для всех worker rate limiter (DB-backed, фиксированное окно).

Счётчики хранятся в PostgreSQL, поэтому лимиты действуют глобально независимо
от числа процессов/worker'ов (в отличие от process-local dict). Каждый вызов
делает один атомарный upsert на ключ; превышение фиксируется и логируется.
"""

import asyncio
import logging
import time
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import text

from backend.core.database import SessionLocal


logger = logging.getLogger(__name__)

# Фиксированное окно в секундах.
RATE_LIMIT_WINDOW_SECONDS = 60
# Как часто удаляются устаревшие окна (не чаще раза в этот интервал).
_CLEANUP_EVERY_SECONDS = 300.0
_RETENTION_SECONDS = 24 * 60 * 60
_last_cleanup_at = time.time()


class RateLimitExceeded(RuntimeError):
    def __init__(self, key: str, limit: int, retry_after_seconds: int):
        super().__init__(f"Rate limit exceeded: {key}")
        self.key = key
        self.limit = limit
        self.retry_after_seconds = retry_after_seconds


def client_ip(request) -> str:
    """IP прямого клиента. Без доверенного reverse proxy это socket peer.

    Если позже появится reverse proxy, нужно переключить источник на
    X-Forwarded-For и настроить forwarded-allow-ips на proxy.
    """
    if request is None or request.client is None:
        return "unknown"
    return request.client.host


def _window_start() -> int:
    return int(time.time() // RATE_LIMIT_WINDOW_SECONDS) * RATE_LIMIT_WINDOW_SECONDS


def _cleanup_expired() -> None:
    cutoff = int(time.time()) - _RETENTION_SECONDS
    session = SessionLocal()
    try:
        session.execute(
            text(
                "DELETE FROM migration_temp.rate_limit_entries "
                "WHERE window_start < :cutoff"
            ),
            {"cutoff": cutoff},
        )
        session.commit()
    except Exception:
        session.rollback()
        logger.warning("rate_limit_cleanup_failed", exc_info=True)
    finally:
        session.close()


def _maybe_cleanup() -> None:
    global _last_cleanup_at
    now = time.time()
    if now - _last_cleanup_at < _CLEANUP_EVERY_SECONDS:
        return
    _last_cleanup_at = now
    _cleanup_expired()


def check_rate_limits(entries: Iterable[tuple[str, int]]) -> None:
    """Применяет набор лимитов фиксированного окна.

    Каждая запись — (key, limit). При превышении любого лимита бросается
    RateLimitExceeded; инкремент при этом уже зафиксирован, поэтому неудачная
    попытка тоже учитывается (защита от brute-force).
    """
    entries = list(entries)
    if not entries:
        return

    window = _window_start()
    session = SessionLocal()
    try:
        for key, limit in entries:
            count = session.execute(
                text(
                    """
                    INSERT INTO migration_temp.rate_limit_entries
                        (key, window_start, count)
                    VALUES (:key, :window, 1)
                    ON CONFLICT (key, window_start)
                    DO UPDATE SET count = migration_temp.rate_limit_entries.count + 1
                    RETURNING count
                    """
                ),
                {"key": key, "window": window},
            ).scalar_one()
            if int(count) > limit:
                session.commit()
                logger.warning(
                    "RATE_LIMIT_EXCEEDED key=%s limit=%s count=%s",
                    key,
                    limit,
                    count,
                )
                raise RateLimitExceeded(key, limit, RATE_LIMIT_WINDOW_SECONDS)
        session.commit()
    finally:
        session.close()
        _maybe_cleanup()


def enforce_rate_limits(entries: Iterable[tuple[str, int]]) -> None:
    """Проверяет лимиты и превращает превышение в HTTP 429."""
    try:
        check_rate_limits(entries)
    except RateLimitExceeded as error:
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов. Попробуйте позже.",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error


async def enforce_rate_limits_async(entries: Iterable[tuple[str, int]]) -> None:
    """Async-вариант для async-эндпоинтов: не блокирует event loop."""
    entries = list(entries)
    try:
        await asyncio.to_thread(check_rate_limits, entries)
    except RateLimitExceeded as error:
        raise HTTPException(
            status_code=429,
            detail="Слишком много запросов. Попробуйте позже.",
            headers={"Retry-After": str(error.retry_after_seconds)},
        ) from error
