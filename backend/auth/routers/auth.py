from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth.dependencies import get_current_user
from backend.auth.schemas import LoginRequest, RegisterRequest
from backend.auth.service import (
    UserAlreadyExistsError,
    login_user,
    register_user,
)


router = APIRouter()


@router.post("/login")
def login(data: LoginRequest):
    result = login_user(
        email=str(data.email),
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
            "email": result["email"],
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "user": current_user,
    }


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest):
    try:
        result = register_user(
            email=str(data.email),
            password=data.password,
        )

    except UserAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с такой почтой уже существует",
        )

    return {
        "success": True,
        "token": result["token"],
        "user": {
            "id": result["user_id"],
            "email": result["email"],
        },
    }


@router.post("/logout")
def logout():
    return {
        "success": True,
    }
