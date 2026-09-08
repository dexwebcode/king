# ФАЙЛ: backend/auth/router.py
# КОМЕНТАРИЙ: Файл для подключения роутеров к префиксу /auth

# PYTHON ИМПОРТЫ
from fastapi import APIRouter
# Коментарии: APIRouter - Класс который позволяет объедленять Endpoints в группы.

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.routers import (
    auth_router,
    vkid_router,
    telegram_router,
)


router = APIRouter(
    prefix="/auth",
    tags=["Авторизация"],
)

# Подключение роутеров
router.include_router(auth_router)
router.include_router(vkid_router)
router.include_router(telegram_router)
