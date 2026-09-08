import os

from backend.core.config import (
    TELEGRAM_BOT_BACKEND_SECRET,
    TELEGRAM_BOT_TOKEN,
)

BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")
