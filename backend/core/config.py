import os
from pathlib import Path

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

TELEGRAM_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "KingPromotion_Support_bot")
TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES = int(
    os.getenv("TELEGRAM_AUTH_SESSION_EXPIRE_MINUTES", "10")
)

VK_APP_ID = int(os.getenv("VK_APP_ID", "54737931"))
VK_REDIRECT_URL = os.getenv(
    "VK_REDIRECT_URL",
    "https://monument-cuddly-outsell.ngrok-free.dev/auth/vk/callback",
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "https://monument-cuddly-outsell.ngrok-free.dev",
).rstrip("/")

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID", "").strip()
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY", "").strip()
YOOKASSA_RETURN_URL = os.getenv("YOOKASSA_RETURN_URL", "").strip()
YOOKASSA_WEBHOOK_URL = os.getenv("YOOKASSA_WEBHOOK_URL", "").strip()
YOOKASSA_AUTO_REGISTER_WEBHOOK = (
    os.getenv("YOOKASSA_AUTO_REGISTER_WEBHOOK", "true").lower() == "true"
)
