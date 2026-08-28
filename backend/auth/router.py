from fastapi import APIRouter

from backend.auth.routers import (
    auth_router,
    social_router,
    telegram_router,
)


router = APIRouter(
    prefix="/auth",
    tags=["Авторизация"],
)

router.include_router(auth_router)
router.include_router(social_router)
router.include_router(telegram_router)
