# ФАЙЛ: main.py является точкой входа в приложение FastAPI.
#КОМЕНТАРИЙ: Он создает экземпляр приложения, настраивает CORS и подключает маршруты для аутентификации.


import asyncio
import logging
from contextlib import asynccontextmanager

# PYTHON ИМПОРТЫ
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ЛЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.router import router as auth_router
from backend.core.config import (
    FRONTEND_URL,
    YOOKASSA_AUTO_REGISTER_WEBHOOK,
    YOOKASSA_SECRET_KEY,
    YOOKASSA_SHOP_ID,
    YOOKASSA_WEBHOOK_URL,
)
from backend.payments.yookassa_service import (
    is_yookassa_webhook_reachable,
    sync_yookassa_webhooks,
)
from backend.payments.router import router as payments_router
from backend.services.get_price import get_price

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if (
        YOOKASSA_AUTO_REGISTER_WEBHOOK
        and YOOKASSA_SHOP_ID
        and YOOKASSA_SECRET_KEY
        and YOOKASSA_WEBHOOK_URL
    ):
        try:
            reachable = await asyncio.to_thread(is_yookassa_webhook_reachable)
            if reachable:
                added = await asyncio.to_thread(sync_yookassa_webhooks)
                if added:
                    logger.info(
                        "YooKassa webhooks registered: %s",
                        ", ".join(added),
                    )
            else:
                logger.warning(
                    "YooKassa webhook URL is not publicly reachable; "
                    "registration skipped"
                )
        except Exception:
            logger.exception("YooKassa webhook registration failed")
    yield


# Создание экземпляра приложения FastAPI с указанием названия и версии
app = FastAPI(
    title="King Promotion API",
    version="1.0.0",
    lifespan=lifespan,
)

# Настройка CORS (Cross-Origin Resource Sharing) для разрешения запросов с указанных источников
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение маршрутов для аутентификации
app.include_router(auth_router)
app.include_router(payments_router)


@app.get("/price")
def price():
    return {
        "success": True,
        "items": get_price(),
    }
