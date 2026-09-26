"""Best-effort Telegram-уведомления поддержки.

Уведомления отправляются ПОСЛЕ commit тикета/сообщения и никогда не влияют
на результат операции: ошибка Telegram только логируется.

Один источник истины для текста и callback-данных кнопок: ими пользуются и
HTTP-отправка (sendMessage), и aiogram-бот (editMessageText). Формат
callback-данных: support:<action>:<internal_ticket_id>.
"""

import html
import json
import logging
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from sqlalchemy import text

from backend.core import config
from backend.core.database import SessionLocal
from backend.support.constants import status_label

logger = logging.getLogger(__name__)

TELEGRAM_TEXT_LIMIT = 4096
TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/{method}"


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


def _send_message(chat_id, text, reply_markup=None, token=None):
    """Отправляет сообщение и возвращает telegram message_id или None."""
    token = token or config.TELEGRAM_SUPPORT_BOT_TOKEN
    if not token or not chat_id:
        logger.warning("telegram_support_notification_skipped reason=not_configured")
        return None

    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        TELEGRAM_API_URL.format(token=token, method="sendMessage"),
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


# --------------------------------------------------------------------------- #
# Callback data
# --------------------------------------------------------------------------- #
def callback_data(action, ticket_id):
    return f"support:{action}:{ticket_id}"


# --------------------------------------------------------------------------- #
# Текст сообщений
# --------------------------------------------------------------------------- #
def build_new_ticket_compact_text(public_id, description, contact):
    text = "🆕 Новое обращение в поддержку\n\n"
    text += f"#{_escape(public_id)}\n\n"
    text += f"Сообщение:\n{_escape(description)}\n\n"
    text += f"Связь:\n{_escape(contact)}"
    return _truncate(text)


def build_user_reply_compact_text(public_id, message):
    text = "💬 Новый ответ\n\n"
    text += f"#{_escape(public_id)}\n\n"
    text += f"Сообщение:\n{_escape(message)}"
    return _truncate(text)


def build_collapse_text(ticket):
    """Компактный вид для кнопки «Скрыть» после «Подробнее»."""
    text = f"💬 Обращение #{_escape(ticket['public_id'])}\n\n"
    text += f"Сообщение:\n{_escape(ticket.get('description') or '—')}\n\n"
    text += f"Связь:\n{_escape(ticket.get('contact') or '—')}"
    return _truncate(text)


def _format_created_at(value):
    if not value:
        return "—"
    dt = value
    if not isinstance(dt, datetime):
        try:
            dt = datetime.fromisoformat(str(value))
        except ValueError:
            return str(value)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%d.%m.%Y %H:%M")


def build_details_text(ticket):
    lines = [
        f"📋 Обращение #{_escape(ticket['public_id'])}",
        "",
        "Пользователь:",
        _escape(ticket.get("user_login") or f"ID {ticket['user_id']}"),
        "",
        "ID пользователя:",
        str(ticket["user_id"]),
        "",
        "Текст обращения:",
        _escape(ticket.get("description") or "—"),
        "",
        "Связь:",
        _escape(ticket.get("contact") or "—"),
        "",
        "Статус:",
        _escape(status_label(ticket["status"], for_admin=True)),
        "",
        "Создано:",
        _format_created_at(ticket.get("created_at")),
    ]
    return _truncate("\n".join(lines))


# --------------------------------------------------------------------------- #
# Клавиатуры (для HTTP sendMessage — словари)
# --------------------------------------------------------------------------- #
def compact_keyboard(internal_ticket_id):
    return _keyboard([
        [
            ("Подробнее", {"callback_data": callback_data("details", internal_ticket_id)}),
            ("Ответить", {"callback_data": callback_data("reply", internal_ticket_id)}),
        ]
    ])


def expanded_keyboard(internal_ticket_id, contact=None):
    rows = [
        [
            ("Скрыть", {"callback_data": callback_data("collapse", internal_ticket_id)}),
            ("Ответить", {"callback_data": callback_data("reply", internal_ticket_id)}),
        ],
        [
            ("Взять в работу", {"callback_data": callback_data("start", internal_ticket_id)}),
            ("Закрыть", {"callback_data": callback_data("close", internal_ticket_id)}),
        ],
    ]
    if contact and _is_safe_url(contact):
        rows.append([("Открыть контакт", {"url": contact})])
    return _keyboard(rows)


# --------------------------------------------------------------------------- #
# Уведомления администратору
# --------------------------------------------------------------------------- #
def send_new_ticket_notification(*, internal_ticket_id, public_id, subject, description, contact, user_login, first_message_id):
    text = build_new_ticket_compact_text(public_id, description, contact)
    sent_id = _send_message(_chat_id(), text, compact_keyboard(internal_ticket_id))
    if sent_id:
        _link_telegram_message(first_message_id, sent_id)
    return sent_id


def send_new_user_reply_notification(*, internal_ticket_id, public_id, user_login, message, support_message_id):
    text = build_user_reply_compact_text(public_id, message)
    sent_id = _send_message(_chat_id(), text, compact_keyboard(internal_ticket_id))
    if sent_id:
        _link_telegram_message(support_message_id, sent_id)
    return sent_id


def send_admin_alert(text: str):
    """Best-effort уведомление администраторов о критическом событии.

    Никогда не выбрасывает исключение: ошибка Telegram только логируется.
    """
    return _send_message(_chat_id(), _truncate(text))


# --------------------------------------------------------------------------- #
# Уведомление пользователю (ответ поддержки)
# --------------------------------------------------------------------------- #
def _get_user_telegram_chat_id(user_id):
    """Возвращает telegram chat id пользователя или None.

    Chat id хранится в user_social_accounts.provider_user_id (для приватного чата
    telegram user id == chat id). Никогда не шлём по username.
    """
    session = SessionLocal()
    try:
        row = session.execute(
            text(
                """
                SELECT provider_user_id
                FROM public.user_social_accounts
                WHERE user_id = :user_id AND provider = 'telegram'
                LIMIT 1
                """
            ),
            {"user_id": user_id},
        ).mappings().first()
    except Exception:
        logger.exception("telegram_user_chat_id_lookup_failed user_id=%s", user_id)
        return None
    finally:
        session.close()
    if row is None:
        return None
    try:
        return int(row["provider_user_id"])
    except (TypeError, ValueError):
        return None


def send_user_reply_notification(*, user_id, public_id, message):
    """Best-effort уведомление пользователя об ответе поддержки.

    Отправляем через основной бот (TELEGRAM_BOT_TOKEN), с которым пользователь
    взаимодействовал при привязке Telegram. Никогда не выбрасывает исключение.
    """
    chat_id = _get_user_telegram_chat_id(user_id)
    if chat_id is None:
        logger.info("telegram_user_notify_skipped reason=not_connected user_id=%s", user_id)
        return None

    text = _truncate(
        "📩 Ответ поддержки KingPromotion\n\n"
        f"Обращение #{_escape(public_id)}\n\n"
        f"{_escape(message)}"
    )
    sent = _send_message(chat_id, text, token=config.TELEGRAM_BOT_TOKEN)
    if sent:
        logger.info("telegram_user_notify_sent user_id=%s chat_id=%s", user_id, chat_id)
    return sent
