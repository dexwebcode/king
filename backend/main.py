# ФАЙЛ: main.py является точкой входа в приложение FastAPI.
#КОМЕНТАРИЙ: Он создает экземпляр приложения, настраивает CORS и подключает маршруты для аутентификации.


# PYTHON ИМПОРТЫ
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ЛЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.router import router as auth_router

# Создание экземпляра приложения FastAPI с указанием названия и версии
app = FastAPI(
    title="King Promotion API",
    version="1.0.0",
)

# Настройка CORS (Cross-Origin Resource Sharing) для разрешения запросов с указанных источников
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение маршрутов для аутентификации
app.include_router(auth_router)