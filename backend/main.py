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
from fastapi.middleware.gzip import GZipMiddleware

# ЛЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.router import router as auth_router
from backend.admin.router import router as admin_router
from backend.core.config import (
    ALLOW_LEGACY_MD5_LOGIN,
    DISPATCH_SWEEP_SECONDS,
    FRONTEND_URL,
    PAYMENT_EXPIRY_SWEEP_SECONDS,
    PROVIDER_CANCEL_RETRY_SWEEP_SECONDS,
    STALE_DISPATCH_ALERT_SWEEP_SECONDS,
    STATUS_SYNC_SWEEP_SECONDS,
)
from backend.payments.router import router as payments_router
from backend.payments.service import (
    alert_stale_dispatch_orders,
    dispatch_pending_orders,
    expire_stale_payments,
    retry_pending_provider_cancellations,
    sync_due_orders,
)
from backend.services.get_price import get_price
from backend.reviews.router import router as reviews_router
from backend.support.router import router as support_router
from backend.support.admin_router import router as support_admin_router
from backend.account.router import router as account_router


logger = logging.getLogger(__name__)


def _log_legacy_password_hashes() -> None:
    """Один раз при старте сообщает, сколько аккаунтов ещё на MD5-хешах."""
    from backend.auth.repository import count_legacy_password_hashes
    from backend.core.database import SessionLocal

    session = SessionLocal()
    try:
        count = count_legacy_password_hashes(session)
    except Exception:
        logger.warning("legacy_password_hash_count_failed", exc_info=True)
    else:
        logger.info(
            "legacy_md5_password_hashes count=%s md5_login_allowed=%s",
            count,
            ALLOW_LEGACY_MD5_LOGIN,
        )
    finally:
        session.close()


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


async def _dispatch_sweep_loop() -> None:
    """Фоновый подхват оплаченных заказов, не отправленных поставщику.

    dispatch_pending_orders выполняет синхронные вызовы поставщика, поэтому
    запускается в отдельном потоке, чтобы не блокировать event loop.
    """
    while True:
        try:
            await asyncio.to_thread(dispatch_pending_orders)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("dispatch sweep failed")
        await asyncio.sleep(DISPATCH_SWEEP_SECONDS)


async def _status_sync_loop() -> None:
    """Фоновая ограниченная синхронизация статусов активных заказов."""
    while True:
        try:
            await asyncio.to_thread(sync_due_orders)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("status sync sweep failed")
        await asyncio.sleep(STATUS_SYNC_SWEEP_SECONDS)


async def _provider_cancel_retry_loop() -> None:
    """Фоновая повторная отмена «зависших» платежей ЮKassa."""
    while True:
        try:
            await asyncio.to_thread(retry_pending_provider_cancellations)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("provider cancel retry sweep failed")
        await asyncio.sleep(PROVIDER_CANCEL_RETRY_SWEEP_SECONDS)


async def _stale_dispatch_alert_loop() -> None:
    """Фоновое уведомление о заказах, зависших в отправке."""
    while True:
        try:
            await asyncio.to_thread(alert_stale_dispatch_orders)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("stale dispatch alert sweep failed")
        await asyncio.sleep(STALE_DISPATCH_ALERT_SWEEP_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Поднимает и останавливает фоновые обходы вместе с приложением."""
    await asyncio.to_thread(_log_legacy_password_hashes)
    expiry_task = asyncio.create_task(_payment_expiry_loop())
    dispatch_task = asyncio.create_task(_dispatch_sweep_loop())
    status_sync_task = asyncio.create_task(_status_sync_loop())
    provider_cancel_task = asyncio.create_task(_provider_cancel_retry_loop())
    stale_dispatch_alert_task = asyncio.create_task(_stale_dispatch_alert_loop())
    try:
        yield
    finally:
        for task in (
            stale_dispatch_alert_task,
            provider_cancel_task,
            status_sync_task,
            dispatch_task,
            expiry_task,
        ):
            task.cancel()
        with suppress(asyncio.CancelledError):
            await asyncio.gather(
                stale_dispatch_alert_task,
                provider_cancel_task,
                status_sync_task,
                dispatch_task,
                expiry_task,
            )


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

# Сжатие JSON-ответов API (gzip) — уменьшает размер XHR-ответов в разы.
app.add_middleware(GZipMiddleware, minimum_size=500)

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
