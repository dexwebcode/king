import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.core.config import TELEGRAM_BOT_TOKEN


logger = logging.getLogger(__name__)


def send_registration_welcome(telegram_id: int) -> None:
    """Best-effort notification; auth must not fail when Telegram is unavailable."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("telegram_welcome_skipped reason=bot_token_missing")
        return

    payload = json.dumps({
        "chat_id": telegram_id,
        "text": "Добро пожаловать в KingPromotion! Ваш аккаунт создан, можно оформлять заказ.",
    }).encode("utf-8")
    request = Request(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        logger.warning(
            "telegram_welcome_failed telegram_id=%s error=%s",
            telegram_id,
            type(error).__name__,
        )
