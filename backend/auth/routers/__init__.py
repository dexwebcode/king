from .auth import router as auth_router
from .vkid import router as vkid_router
from .telegram import router as telegram_router

__all__ = [
    "auth_router",
    "vkid_router",
    "telegram_router",
]
