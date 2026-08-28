import asyncio

import aiohttp
from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramNetworkError
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import Message

from backend.bots.config import BACKEND_PUBLIC_URL, TELEGRAM_BOT_TOKEN


async def send_token_to_backend(
    token: str,
    telegram_id: int,
    telegram_username: str | None,
) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{BACKEND_PUBLIC_URL.rstrip('/')}/auth/telegram/start",
            json={
                "token": token,
                "telegram_id": telegram_id,
                "telegram_username": telegram_username,
            },
            timeout=aiohttp.ClientTimeout(total=10),
        ) as response:
            return await response.json()


async def start_handler(
    message: Message,
    command: CommandObject,
) -> None:
    user = message.from_user
    token = command.args.strip() if command.args else ""

    if user is None:
        return

    if not token:
        await message.answer(
            "Токен авторизации не найден. Откройте бота по кнопке на сайте."
        )
        return

    await message.answer(
        "Приветствую, авторизуем вас на сайте."
    )

    try:
        result = await send_token_to_backend(
            token=token,
            telegram_id=user.id,
            telegram_username=user.username,
        )

    except aiohttp.ClientError:
        await message.answer(
            "Не удалось связаться с сервером. Попробуйте позже."
        )
        return

    except (asyncio.TimeoutError, ValueError):
        await message.answer(
            "Сервер вернул некорректный ответ. Попробуйте позже."
        )
        return

    if result.get("authorized"):
        await asyncio.sleep(2)
        await message.answer(
            "Готово, Telegram успешно авторизован."
        )
        return

    await message.answer(
        result.get("message") or "Авторизация не выполнена."
    )


async def run_telegram_bot() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN не задан в backend/.env"
        )

    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    dispatcher = Dispatcher()

    dispatcher.message.register(start_handler, CommandStart())

    print("Telegram bot started. Waiting for messages...")

    try:
        await dispatcher.start_polling(bot)

    except TelegramNetworkError as error:
        print(
            "Не удалось подключиться к Telegram API. "
            "Проверьте интернет, DNS или доступ к api.telegram.org."
        )
        print(f"Детали: {error}")


def run() -> None:
    asyncio.run(run_telegram_bot())


if __name__ == "__main__":
    run()
