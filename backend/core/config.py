import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


DATABASE_URL = os.environ["DATABASE_URL"]
SECRET_KEY = os.environ["SECRET_KEY"]
DATABASE_ECHO = os.getenv("DATABASE_ECHO", "false").lower() == "true"

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
)

KINGPROMOTION_API_KEY = os.getenv("KINGPROMOTION_API_KEY", "")
KINGPROMOTION_API_URL = os.getenv(
    "KINGPROMOTION_API_URL",
    "https://kingpromotion.space/api/v2/",
)
KINGPROMOTION_MARKUP_PERCENT = float(
    os.getenv("KINGPROMOTION_MARKUP_PERCENT", "50")
)
REFERRAL_REWARD_PERCENT = os.getenv("REFERRAL_REWARD_PERCENT", "12")


def _parse_admin_user_ids(raw_value: str) -> frozenset[int]:
    values: set[int] = set()
    for item in raw_value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            user_id = int(item)
        except ValueError as error:
            raise RuntimeError("ADMIN_USER_IDS должен содержать только числа") from error
        if user_id <= 0:
            raise RuntimeError("ADMIN_USER_IDS должен содержать положительные ID")
        values.add(user_id)
    return frozenset(values)


ADMIN_USER_IDS = _parse_admin_user_ids(os.getenv("ADMIN_USER_IDS", ""))

TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "KingPromotion_Support_bot")
TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES = int(
    os.getenv("TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES", "10")
)
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_BOT_BACKEND_SECRET = os.getenv(
    "TELEGRAM_BOT_BACKEND_SECRET",
    SECRET_KEY,
).strip()

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://monument-cuddly-outsell.ngrok-free.dev",
).rstrip("/")

VK_APP_ID = int(os.getenv("VK_APP_ID", "54737931"))
VK_REDIRECT_URL = os.getenv(
    "VK_REDIRECT_URL",
    "https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback",
)
VK_AUTH_SESSION_EXPIRE_MINUTES = int(
    os.getenv("VK_AUTH_SESSION_EXPIRE_MINUTES", "10")
)

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "").strip()
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "").strip()
YOOKASSA_RETURN_URL = os.getenv("YOOKASSA_RETURN_URL", "").strip()
YOOKASSA_BALANCE_RETURN_URL = os.getenv(
    "YOOKASSA_BALANCE_RETURN_URL",
    f"{FRONTEND_URL}/main?section=balance&topup=return",
).strip()

YOOKASSA_CONNECT_TIMEOUT_SECONDS = float(
    os.getenv("YOOKASSA_CONNECT_TIMEOUT_SECONDS", "3")
)
YOOKASSA_READ_TIMEOUT_SECONDS = float(
    os.getenv("YOOKASSA_READ_TIMEOUT_SECONDS", "12")
)

CRYSTALPAY_AUTH_LOGIN = os.getenv("CRYSTALPAY_AUTH_LOGIN", "").strip()
CRYSTALPAY_AUTH_SECRET = os.getenv("CRYSTALPAY_AUTH_SECRET", "").strip()
CRYSTALPAY_SALT = os.getenv("CRYSTALPAY_SALT", "").strip()
CRYSTALPAY_CALLBACK_URL = os.getenv("CRYSTALPAY_CALLBACK_URL", "").strip()
CRYSTALPAY_REDIRECT_URL = os.getenv(
    "CRYSTALPAY_REDIRECT_URL",
    f"{FRONTEND_URL}/payment/success",
).strip()
CRYSTALPAY_ORDER_REDIRECT_URL = os.getenv(
    "CRYSTALPAY_ORDER_REDIRECT_URL",
    f"{FRONTEND_URL}/payment/success",
).strip()
CRYSTALPAY_API_URL = os.getenv(
    "CRYSTALPAY_API_URL",
    "https://api.crystalpay.io/v3/",
).rstrip("/") + "/"
CRYSTALPAY_INVOICE_LIFETIME_MINUTES = int(
    os.getenv("CRYSTALPAY_INVOICE_LIFETIME_MINUTES", "60")
)
CRYSTALPAY_TIMEOUT_SECONDS = float(
    os.getenv("CRYSTALPAY_TIMEOUT_SECONDS", "12")
)


def validate_payment_url(
    name: str,
    value: str,
    *,
    allow_local_http: bool = False,
) -> None:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    is_local_http = (
        allow_local_http
        and parsed.scheme == "http"
        and hostname in {"localhost", "127.0.0.1"}
    )
    if (parsed.scheme != "https" or not hostname) and not is_local_http:
        raise RuntimeError(f"{name} должен быть публичным HTTPS URL")
    if hostname == "example.com":
        raise RuntimeError(f"{name} содержит тестовый или локальный адрес")


if CRYSTALPAY_CALLBACK_URL:
    validate_payment_url("CRYSTALPAY_CALLBACK_URL", CRYSTALPAY_CALLBACK_URL)
    if urlparse(CRYSTALPAY_CALLBACK_URL).path != "/api/payments/crystalpay/callback":
        raise RuntimeError("CRYSTALPAY_CALLBACK_URL содержит неверный путь")
if CRYSTALPAY_REDIRECT_URL:
    validate_payment_url(
        "CRYSTALPAY_REDIRECT_URL",
        CRYSTALPAY_REDIRECT_URL,
        allow_local_http=True,
    )
if CRYSTALPAY_ORDER_REDIRECT_URL:
    validate_payment_url(
        "CRYSTALPAY_ORDER_REDIRECT_URL",
        CRYSTALPAY_ORDER_REDIRECT_URL,
        allow_local_http=True,
    )
