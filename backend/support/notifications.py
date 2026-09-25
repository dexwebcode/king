"""Best-effort Telegram-уведомления для администраторов поддержки.

Уведомления отправляются ПОСЛЕ commit тикета/сообщения и никогда не влияют
на результат операции: ошибка Telegram только логируется.
"""

import html
import json
import logging
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from sqlalchemy import text

from backend.core import config
from backend.core.database import SessionLocal

logger = logging.getLogger(__name__)

TELEGRAM_TEXT_LIMIT = 4096
TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"


def _escape(value):
    return html.escape(str(value), quote=False)


_TRUNCATE_SUFFIX = "… (сокращено)"


def _truncate(text, limit=TELEGRAM_TEXT_LIMIT):
    if len(text) <= limit:
        return text
    return text[: limit - len(_TRUNCATE_SUFFIX)].rstrip() + _TRUNCATE_SUFFIX


def _is_safe_url(value):
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _chat_id():
    return config.TELEGRAM_SUPPORT_CHAT_ID


def _send_message(chat_id, text, reply_markup=None):
    """Отправляет сообщение и возвращает telegram message_id или None."""
    if not config.TELEGRAM_SUPPORT_BOT_TOKEN or not chat_id:
        logger.warning("telegram_support_notification_skipped reason=not_configured")
        return None

    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        TELEGRAM_API_URL.format(token=config.TELEGRAM_SUPPORT_BOT_TOKEN),
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    last_error = None
    for attempt in (1, 2):
        try:
            with urlopen(request, timeout=8) as response:
                data = json.loads(response.read())
            if data.get("ok"):
                return data.get("result", {}).get("message_id")
            last_error = data.get("description")
            break
        except HTTPError as error:
            last_error = f"HTTP {error.code}"
            if error.code in (429, 500, 502, 503) and attempt == 1:
                time.sleep(1)
                continue
            break
        except (URLError, TimeoutError, OSError) as error:
            last_error = type(error).__name__
            if attempt == 1:
                time.sleep(1)
                continue
            break
        except (json.JSONDecodeError, ValueError) as error:
            last_error = type(error).__name__
            break
    logger.warning("telegram_support_notification_failed error=%s", last_error)
    return None


def _link_telegram_message(support_message_id, telegram_message_id):
    session = SessionLocal()
    try:
        session.execute(
            text(
                """
                UPDATE migration_temp.support_messages
                SET telegram_message_id = :telegram_message_id
                WHERE id = :support_message_id
                """
            ),
            {"support_message_id": support_message_id, "telegram_message_id": telegram_message_id},
        )
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("telegram_support_link_message_failed")
    finally:
        session.close()


def _keyboard(rows):
    return {"inline_keyboard": [[{"text": text, **extra} for text, extra in row] for row in rows]}


def send_new_ticket_notification(*, internal_ticket_id, public_id, subject, description, contact, user_login, first_message_id):
    text = _truncate(
        "🆕 Новое обращение\n\n"
        f"#{_escape(public_id)}\n\n"
        f"Пользователь:\n{_escape(user_login)}\n\n"
        f"Тема:\n{_escape(subject)}\n\n"
        f"Сообщение:\n{_escape(description)}\n\n"
        f"Контакт:\n{_escape(contact)}\n\n"
        "Статус:\nНовая"
    )
    rows = [
        [
            ("Ответить", {"callback_data": f"support:reply:{internal_ticket_id}"}),
            ("Взять в работу", {"callback_data": f"support:start:{internal_ticket_id}"}),
            ("Закрыть", {"callback_data": f"support:close:{internal_ticket_id}"}),
        ]
    ]
    if _is_safe_url(contact):
        rows.append([("Открыть контакт", {"url": contact})])
    sent_id = _send_message(_chat_id(), text, _keyboard(rows))
    if sent_id:
        _link_telegram_message(first_message_id, sent_id)
    return sent_id


def send_new_user_reply_notification(*, internal_ticket_id, public_id, user_login, message, support_message_id):
    text = _truncate(
        "💬 Новый ответ\n\n"
        f"#{_escape(public_id)}\n\n"
        f"Пользователь:\n{_escape(user_login)}\n\n"
        f"Сообщение:\n{_escape(message)}"
    )
    open_url = f"{config.FRONTEND_URL}/admin/support/{public_id}"
    rows = [
        [
            ("Ответить", {"callback_data": f"support:reply:{internal_ticket_id}"}),
            ("Открыть тикет", {"url": open_url}),
            ("Закрыть", {"callback_data": f"support:close:{internal_ticket_id}"}),
        ]
    ]
    sent_id = _send_message(_chat_id(), text, _keyboard(rows))
    if sent_id:
        _link_telegram_message(support_message_id, sent_id)
    return sent_id
