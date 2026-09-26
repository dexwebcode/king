"""Telegram-бот поддержки для администраторов (aiogram 3.x).

Запуск (поддержка + авторизация одним ботом):  python -m backend.bots
Только поддержка (отдельный токен):             python -m backend.support

Бот — дополнительный административный интерфейс. Источник истины — PostgreSQL,
вся бизнес-логика — в backend.support.service.SupportService.
"""

import asyncio
import logging
import sys
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from backend.core import config  # noqa: E402
from backend.support.constants import SupportTicketStatus  # noqa: E402
from backend.support.notifications import (  # noqa: E402
    _is_safe_url,
    build_collapse_text,
    build_details_text,
    callback_data,
    send_user_reply_notification,
)
from backend.support.service import (  # noqa: E402
    SupportService,
    TicketClosedError,
    TicketNotFoundError,
)

logger = logging.getLogger(__name__)
router = Router()

MESSAGE_MAX_LENGTH = 5000


class ReplyState(StatesGroup):
    waiting_text = State()


def _is_allowed(telegram_user_id, chat_id) -> bool:
    if telegram_user_id not in config.TELEGRAM_SUPPORT_ADMIN_IDS:
        return False
    if config.TELEGRAM_SUPPORT_CHAT_ID:
        if chat_id is None or int(chat_id) != int(config.TELEGRAM_SUPPORT_CHAT_ID):
            return False
    return True


def _callback_ticket_id(data) -> int | None:
    parts = (data or "").split(":")
    if len(parts) != 3 or parts[0] != "support":
        return None
    try:
        return int(parts[2])
    except ValueError:
        return None


def _log_unauthorized(event) -> None:
    from_user = event.from_user
    logger.warning(
        "Unauthorized Telegram admin action telegram_id=%s",
        from_user.id if from_user else None,
    )


def _admin_keyboard(internal_ticket_id: int, *, expanded: bool, contact: str | None) -> InlineKeyboardMarkup:
    if expanded:
        buttons = [
            [
                InlineKeyboardButton(text="Скрыть", callback_data=callback_data("collapse", internal_ticket_id)),
                InlineKeyboardButton(text="Ответить", callback_data=callback_data("reply", internal_ticket_id)),
            ],
            [
                InlineKeyboardButton(text="Взять в работу", callback_data=callback_data("start", internal_ticket_id)),
                InlineKeyboardButton(text="Закрыть", callback_data=callback_data("close", internal_ticket_id)),
            ],
        ]
        if contact and _is_safe_url(contact):
            buttons.append([InlineKeyboardButton(text="Открыть контакт", url=contact)])
    else:
        buttons = [
            [
                InlineKeyboardButton(text="Подробнее", callback_data=callback_data("details", internal_ticket_id)),
                InlineKeyboardButton(text="Ответить", callback_data=callback_data("reply", internal_ticket_id)),
            ]
        ]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def _edit_admin_message(callback: CallbackQuery, text: str, markup: InlineKeyboardMarkup) -> None:
    try:
        await callback.message.edit_text(text=text, reply_markup=markup, parse_mode="HTML")
    except TelegramBadRequest as error:
        # Повторное нажатие той же кнопки даёт "message is not modified" — это не ошибка.
        if "not modified" not in str(error).lower():
            logger.warning("telegram_support_edit_failed error=%s", error)
    await callback.answer()


def _send_admin_reply(public_id, text, telegram_message_id):
    return SupportService.admin_send_message(
        public_id=public_id,
        admin_user_id=None,
        message=text,
        telegram_message_id=telegram_message_id,
    )


async def _notify_user_after_reply(result, public_id, text) -> None:
    """Best-effort уведомление пользователя; не мешает подтверждению ответа."""
    try:
        await asyncio.to_thread(
            send_user_reply_notification,
            user_id=result["ticket_user_id"],
            public_id=public_id,
            message=text,
        )
    except Exception:
        logger.exception("telegram_user_notify_failed public_id=%s", public_id)


@router.callback_query()
async def handle_callback(callback: CallbackQuery, state: FSMContext):
    from_user = callback.from_user
    chat_id = callback.message.chat.id if callback.message else None
    if from_user is None or not _is_allowed(from_user.id, chat_id):
        _log_unauthorized(callback)
        await callback.answer("Доступ запрещён", show_alert=True)
        return

    data = callback.data or ""
    if not data.startswith("support:"):
        return
    ticket_id = _callback_ticket_id(data)
    if ticket_id is None:
        await callback.answer("Некорректный запрос", show_alert=True)
        return
    action = data.split(":")[1]
    if callback.message is None:
        await callback.answer("Сообщение недоступно", show_alert=True)
        return

    ticket = SupportService.get_ticket_admin_context(ticket_id=ticket_id)
    if ticket is None:
        await callback.answer("Обращение не найдено", show_alert=True)
        return
    public_id = ticket["public_id"]

    if action == "details":
        await _edit_admin_message(
            callback,
            build_details_text(ticket),
            _admin_keyboard(ticket_id, expanded=True, contact=ticket.get("contact")),
        )
    elif action == "collapse":
        await _edit_admin_message(
            callback,
            build_collapse_text(ticket),
            _admin_keyboard(ticket_id, expanded=False, contact=None),
        )
    elif action == "reply":
        if ticket["status"] == SupportTicketStatus.CLOSED.value:
            await callback.answer("Обращение закрыто", show_alert=True)
            return
        await state.set_state(ReplyState.waiting_text)
        await state.update_data(public_id=public_id)
        await callback.message.answer(
            f"Введите сообщение для ответа на обращение #{public_id}.\n\n"
            "Для отмены используйте /cancel."
        )
        await callback.answer()
    elif action == "start":
        if ticket["status"] == SupportTicketStatus.CLOSED.value:
            await callback.answer("Обращение уже закрыто", show_alert=True)
            return
        if ticket["status"] == SupportTicketStatus.IN_PROGRESS.value:
            await callback.answer("Обращение уже в работе", show_alert=True)
            return
        SupportService.admin_change_status(
            public_id=public_id,
            admin_user_id=None,
            status=SupportTicketStatus.IN_PROGRESS.value,
        )
        await callback.message.answer(f"✅ Обращение #{public_id} взято в работу")
        await callback.answer()
    elif action == "close":
        if ticket["status"] == SupportTicketStatus.CLOSED.value:
            await callback.answer("Обращение уже закрыто", show_alert=True)
            return
        SupportService.admin_change_status(
            public_id=public_id,
            admin_user_id=None,
            status=SupportTicketStatus.CLOSED.value,
        )
        await callback.message.answer(f"✅ Обращение #{public_id} закрыто")
        await callback.answer()
    else:
        await callback.answer("Неизвестное действие", show_alert=True)


@router.message(Command("cancel"))
async def cancel_reply(message: Message, state: FSMContext):
    from_user = message.from_user
    if from_user is None or not _is_allowed(from_user.id, message.chat.id):
        _log_unauthorized(message)
        return
    data = await state.get_data()
    had_active_reply = bool(data.get("public_id"))
    await state.clear()
    if had_active_reply:
        await message.answer("Ответ отменён.")
    else:
        await message.answer("Нет активного действия для отмены.")


@router.message(ReplyState.waiting_text, F.text, ~F.text.startswith("/"))
async def process_reply(message: Message, state: FSMContext):
    from_user = message.from_user
    if from_user is None or not _is_allowed(from_user.id, message.chat.id):
        _log_unauthorized(message)
        await state.clear()
        return
    data = await state.get_data()
    public_id = data.get("public_id")
    await state.clear()

    text = (message.text or "").strip()
    if not text:
        await message.answer("Сообщение не может быть пустым.")
        return
    if len(text) > MESSAGE_MAX_LENGTH:
        await message.answer("Сообщение слишком длинное.")
        return
    try:
        result = _send_admin_reply(public_id, text, message.message_id)
    except TicketNotFoundError:
        await message.answer("Обращение не найдено.")
        return
    except TicketClosedError:
        await message.answer("Обращение закрыто. Ответ не отправлен.")
        return
    await message.answer("✅ Ответ отправлен пользователю")
    await _notify_user_after_reply(result, public_id, text)


@router.message(F.reply_to_message, F.text, ~F.text.startswith("/"))
async def process_reply_to_notification(message: Message):
    from_user = message.from_user
    if from_user is None or not _is_allowed(from_user.id, message.chat.id):
        _log_unauthorized(message)
        return
    ticket = SupportService.get_ticket_by_telegram_message_id(
        telegram_message_id=message.reply_to_message.message_id
    )
    if ticket is None:
        await message.answer("Не удалось определить обращение. Используйте кнопку «Ответить».")
        return
    public_id = ticket["public_id"]
    text = (message.text or "").strip()
    if not text:
        await message.answer("Сообщение не может быть пустым.")
        return
    if len(text) > MESSAGE_MAX_LENGTH:
        await message.answer("Сообщение слишком длинное.")
        return
    try:
        result = _send_admin_reply(public_id, text, message.message_id)
    except TicketNotFoundError:
        await message.answer("Обращение не найдено.")
        return
    except TicketClosedError:
        await message.answer("Обращение закрыто. Ответ не отправлен.")
        return
    await message.answer("✅ Ответ отправлен пользователю")
    await _notify_user_after_reply(result, public_id, text)


@router.message(F.text, ~F.text.startswith("/"))
async def fallback(message: Message):
    from_user = message.from_user
    if from_user is None or not _is_allowed(from_user.id, message.chat.id):
        _log_unauthorized(message)
        return
    await message.answer(
        "Управление обращениями — через кнопки уведомлений. "
        "«Ответить» — ответить в обращение, «Взять в работу» / «Закрыть» — изменить статус. "
        "Либо нажмите Reply на уведомление, чтобы ответить в тикет."
    )


async def run_bot() -> None:
    if not config.TELEGRAM_SUPPORT_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_SUPPORT_BOT_TOKEN не задан в backend/.env")
    if not config.TELEGRAM_SUPPORT_ADMIN_IDS:
        raise RuntimeError("TELEGRAM_SUPPORT_ADMIN_IDS не задан — без whitelist бот небезопасен")

    bot = Bot(token=config.TELEGRAM_SUPPORT_BOT_TOKEN)
    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.include_router(router)
    logger.info("Support Telegram bot started")
    await dispatcher.start_polling(bot)


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot())


if __name__ == "__main__":
    run()
