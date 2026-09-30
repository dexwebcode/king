"""Централизованные настройки приложения (app_settings) с кешем процесса.

Глобальная наценка хранится ОДНИМ значением в БД и применяется в
services/get_price.py; окно активности пользователей конфигурируется
администратором и используется в статистике dashboard.
"""

import logging
import threading
from decimal import Decimal, InvalidOperation

from sqlalchemy import text

from backend.core.config import KINGPROMOTION_MARKUP_PERCENT
from backend.core.database import SessionLocal

logger = logging.getLogger(__name__)

MARKUP_KEY = "global_markup_percent"
ACTIVE_WINDOW_KEY = "active_users_window_minutes"

MARKUP_MIN = Decimal("0")
MARKUP_MAX = Decimal("1000")
MARKUP_DECIMALS = Decimal("0.01")

ACTIVE_WINDOW_MIN_MINUTES = 5
ACTIVE_WINDOW_MAX_MINUTES = 60 * 24 * 365

_cache: dict[str, str] = {}
_lock = threading.Lock()


def _read_setting(key: str) -> str | None:
    session = SessionLocal()
    try:
        row = session.execute(
            text(
                "SELECT value FROM migration_temp.app_settings WHERE key = :key"
            ),
            {"key": key},
        ).first()
    finally:
        session.close()
    return str(row[0]) if row is not None else None


def _store_setting(key: str, value: str) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            session.execute(
                text("""
                    INSERT INTO migration_temp.app_settings (key, value)
                    VALUES (:key, :value)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                """),
                {"key": key, "value": value},
            )
    finally:
        session.close()
    with _lock:
        _cache[key] = value


def get_setting(key: str, default: str | None = None) -> str | None:
    with _lock:
        if key in _cache:
            return _cache[key]
    value = _read_setting(key)
    if value is None and default is not None:
        value = default
        _store_setting(key, value)
    with _lock:
        _cache[key] = value
    return value


def set_setting(key: str, value: str, *, admin_id: int | None = None) -> None:
    session = SessionLocal()
    try:
        with session.begin():
            session.execute(
                text("""
                    INSERT INTO migration_temp.app_settings (key, value, updated_by)
                    VALUES (:key, :value, :admin_id)
                    ON CONFLICT (key) DO UPDATE
                        SET value = EXCLUDED.value,
                            updated_at = NOW(),
                            updated_by = EXCLUDED.updated_by
                """),
                {"key": key, "value": value, "admin_id": admin_id},
            )
    finally:
        session.close()
    with _lock:
        _cache[key] = value


def clear_settings_cache() -> None:
    with _lock:
        _cache.clear()


def parse_markup_value(raw: object) -> Decimal:
    """Чистая функция валидации значения наценки (тестируется без БД)."""
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("Наценка должна быть числом") from None
    if not value.is_finite():
        raise ValueError("Наценка должна быть числом")
    value = value.quantize(MARKUP_DECIMALS)
    if value < MARKUP_MIN or value > MARKUP_MAX:
        raise ValueError(f"Наценка должна быть в диапазоне {MARKUP_MIN}–{MARKUP_MAX}%")
    return value


def get_markup_percent() -> Decimal:
    value = get_setting(MARKUP_KEY, str(KINGPROMOTION_MARKUP_PERCENT))
    try:
        return parse_markup_value(value)
    except ValueError:
        return Decimal(str(KINGPROMOTION_MARKUP_PERCENT))


def set_markup_percent(value: object, *, admin_id: int) -> Decimal:
    parsed = parse_markup_value(value)
    set_setting(MARKUP_KEY, str(parsed), admin_id=admin_id)
    logger.info("markup_changed admin_id=%s value=%s", admin_id, parsed)
    return parsed


def parse_active_window_value(raw: object) -> int:
    """Чистая функция валидации окна активности (тестируется без БД)."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        raise ValueError("Период должен быть целым числом минут") from None
    if value < ACTIVE_WINDOW_MIN_MINUTES or value > ACTIVE_WINDOW_MAX_MINUTES:
        raise ValueError(
            f"Период должен быть в диапазоне {ACTIVE_WINDOW_MIN_MINUTES}–"
            f"{ACTIVE_WINDOW_MAX_MINUTES} минут"
        )
    return value


def get_active_users_window_minutes() -> int:
    value = get_setting(ACTIVE_WINDOW_KEY, "30")
    try:
        return parse_active_window_value(value)
    except ValueError:
        return 30


def set_active_users_window_minutes(value: object, *, admin_id: int) -> int:
    parsed = parse_active_window_value(value)
    set_setting(ACTIVE_WINDOW_KEY, str(parsed), admin_id=admin_id)
    logger.info("active_window_changed admin_id=%s value=%s", admin_id, parsed)
    return parsed
