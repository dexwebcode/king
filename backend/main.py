# ФАЙЛ: main.py является точкой входа в приложение FastAPI.
#КОМЕНТАРИЙ:
# > Он создает экземпляр приложения,
# > Настраивает CORS
# > Подключает маршруты для аутентификации.


# PYTHON ИМПОРТЫ
import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# ЛЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.router import router as auth_router
from backend.admin.router import router as admin_router
from backend.core.config import FRONTEND_URL, PAYMENT_EXPIRY_SWEEP_SECONDS
from backend.payments.router import router as payments_router
from backend.payments.service import expire_stale_payments
from backend.services.get_price import get_price
from backend.reviews.router import router as reviews_router
from backend.support.router import router as support_router
from backend.support.admin_router import router as support_admin_router
from backend.account.router import router as account_router


logger = logging.getLogger(__name__)


async def _payment_expiry_loop() -> None:
    """Фоновая отмена платежей, не оплаченных в течение окна оплаты."""
    while True:
        try:
            await expire_stale_payments()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("payment expiry sweep failed")
        await asyncio.sleep(PAYMENT_EXPIRY_SWEEP_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Поднимает и останавливает фоновый обход вместе с приложением."""
    task = asyncio.create_task(_payment_expiry_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


# Создание экземпляра приложения FastAPI с указанием названия и версии
app = FastAPI(
    title="King Promotion API",
    version="1.0.0",
    lifespan=lifespan,
)

# Настройка CORS (Cross-Origin Resource Sharing) для разрешения запросов с указанных источников
app.add_middleware(
    CORSMiddleware,
    # Ссылки с разрешением обращаться к app
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        FRONTEND_URL, # Настраиваемый фронетнд адрес
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение маршрутов для аутентификации
app.include_router(auth_router)
app.include_router(payments_router)
app.include_router(admin_router)
app.include_router(reviews_router)
app.include_router(support_router)
app.include_router(support_admin_router)
app.include_router(account_router)

@app.get("/price")
def price(platform: str | None = Query(default=None, max_length=32)):
    return {
        "success": True,
        "items": get_price(platform=platform),
    }
