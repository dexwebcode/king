# ФАЙЛ: backend/auth/router.py является маршрутизатором для аутентификации в приложении FastAPI.
# КОМЕНТАРИЙ:
#       Файл определяет маршруты для входа в систему, получения информации о текущем
#       пользователе и выхода из системы, используя JWT для аутентификации.

# PYTHON ИМПОРТЫ
from fastapi import APIRouter, Depends, HTTPException, status

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from .dependencies import get_current_user
from .schemas import LoginRequest
from .service import login_user

# Создание экземпляра маршрутизатора FastAPI с префиксом "/auth" и тегом "Авторизация"
router = APIRouter(
    prefix="/auth",
    tags=["Авторизация"],
)

# Определение маршрута для входа в систему
@router.post("/login")
def login(data: LoginRequest):
    # Вызов функции login_user для проверки учетных данных пользователя
    result = login_user(
        login_or_email=data.login,
        password=data.password,
    )

    # Если результат проверки учетных данных равен None,
    #     выбрасывается исключение HTTPException с кодом 401 (Unauthorized)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин, почта или пароль",
        )

    return {
        "success": True,
        "token": result["token"],
        "user": {
            "id": result["user_id"],
            "login": result["login"],
        },
    }

# Определение маршрута для получения информации о текущем пользователе
@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "user": current_user,
    }

# Определение маршрута для выхода из системы
@router.post("/logout")
def logout():
    # JWT хранится у клиента, поэтому клиент просто удаляет его.
    return {
        "success": True,
    }