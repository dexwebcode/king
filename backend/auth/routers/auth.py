# ФАЙЛ: backend/auth/routers/auth.py
#
# Содержит HTTP-endpoints базовой авторизации:
# вход, регистрацию, получение текущего пользователя и выход.
#
# Router принимает и валидирует HTTP-данные через schemas,
# а основную логику входа и регистрации передаёт в auth.service.

# PYTHON ИМПОРТЫ
from fastapi import APIRouter, Depends, HTTPException, status

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.dependencies import get_current_user
from backend.auth.schemas import LoginRequest, RegisterRequest
from backend.auth.service import (
    UserAlreadyExistsError,
    login_user,
    register_user,
)


router = APIRouter()

# Endpoint входа пользователя
@router.post("/login")
def login(data: LoginRequest):
    result = login_user(
        login_or_email=data.identifier,
        password=data.password,
    )

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
            "email": result["email"],
        },
    }

# Endpoint получения информации о пользователе
@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "user": {
            "id": current_user["id"],
            "login": current_user["login"],
            "email": current_user["mail"],
        },
    }

# Endpoint регитрации
@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest):
    try:
        result = register_user(
            login=data.login,
            email=data.email,
            password=data.password,
        )

    except UserAlreadyExistsError as error:
        detail = (
            "Пользователь с таким логином уже существует"
            if str(error) == "login"
            else "Пользователь с такой почтой уже существует"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )

    return {
        "success": True,
        "token": result["token"],
        "user": {
            "id": result["user_id"],
            "login": result["login"],
            "email": result["email"],
        },
    }

# Endpoint выхода
@router.post("/logout")
def logout():
    return {
        "success": True,
    }
