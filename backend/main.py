# ФАЙЛ: main.py является точкой входа в приложение FastAPI.
#КОМЕНТАРИЙ:
# > Он создает экземпляр приложения,
# > Настраивает CORS
# > Подключает маршруты для аутентификации.


# PYTHON ИМПОРТЫ
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# ЛЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.router import router as auth_router
from backend.core.config import FRONTEND_URL
from backend.payments.router import router as payments_router
from backend.services.get_price import get_price


# Создание экземпляра приложения FastAPI с указанием названия и версии
app = FastAPI(
    title="King Promotion API",
    version="1.0.0",
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

@app.get("/price")
def price(platform: str | None = Query(default=None, max_length=32)):
    return {
        "success": True,
        "items": get_price(platform=platform),
    }
