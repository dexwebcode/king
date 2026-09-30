"""Журнал действий администраторов (admin_audit_log).

В журнал пишутся только факты операций: кто, что, над каким объектом,
старое/новое значение. Пароли, токены и API-ключи сюда не попадают.
"""

import logging

from sqlalchemy import text

from backend.core.database import SessionLocal

logger = logging.getLogger(__name__)

MAX_VALUE_LENGTH = 2000


def sanitize_audit_value(value: object) -> str | None:
    """Нормализует значение для журнала: без переводов строк, с обрезкой."""
    if value is None:
        return None
    text_value = str(value).replace("\r", " ").replace("\n", " ")
    return text_value[:MAX_VALUE_LENGTH]


def record_audit(
    *,
    admin_id: int,
    action: str,
    entity_type: str,
    entity_id: object = None,
    old_value: object = None,
    new_value: object = None,
) -> None:
    """Пишет событие в журнал; ошибка журналирования не роняет операцию."""
    session = SessionLocal()
    try:
        with session.begin():
            session.execute(
                text("""
                    INSERT INTO migration_temp.admin_audit_log (
                        admin_id, action, entity_type, entity_id,
                        old_value, new_value
                    ) VALUES (
                        :admin_id, :action, :entity_type, :entity_id,
                        :old_value, :new_value
                    )
                """),
                {
                    "admin_id": int(admin_id),
                    "action": str(action)[:64],
                    "entity_type": str(entity_type)[:64],
                    "entity_id": (
                        None if entity_id is None else str(entity_id)[:255]
                    ),
                    "old_value": sanitize_audit_value(old_value),
                    "new_value": sanitize_audit_value(new_value),
                },
            )
    except Exception:
        logger.exception("audit_log_write_failed action=%s", action)
    finally:
        session.close()
