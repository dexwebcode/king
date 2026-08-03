from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import hashlib


app = FastAPI(
    title="King API",
    version="1.0.0"
)

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
# -----------------------------
# МОДЕЛИ ДАННЫХ
# -----------------------------

class RegisterRequest(BaseModel):
    login: str
    password: str


class LoginRequest(BaseModel):
    login: str
    password: str


class CheckLoginRequest(BaseModel):
    login: str


# -----------------------------
# ГЛАВНАЯ
# -----------------------------

@app.get("/")
async def root():
    return {
        "message": "King API работает"
    }


# -----------------------------
# ПРОВЕРКА ЛОГИНА
# -----------------------------

@app.post("/check-login")
async def check_login(data: CheckLoginRequest):

    print("Проверка логина:")
    print(data.login)

    return {
        "exists": False
    }


# -----------------------------
# РЕГИСТРАЦИЯ
# -----------------------------

@app.post("/register")
async def register(data: RegisterRequest):

    print("Регистрация")

    print("Login:", data.login)
    print("Password:", data.password)

    return {
        "success": True,
        "message": "Регистрация успешна"
    }


# -----------------------------
# ВХОД
# -----------------------------

@app.post("/login")
async def login(data: LoginRequest):

    print("Авторизация")

    print("Login:", data.login)
    print("Password:", data.password)
    password_md5 = hashlib.md5(
    data.password.encode("utf-8")
    ).hexdigest()

    print(password_md5)
    return {
        "success": True,
        "message": "Авторизация успешна"
    }


# -----------------------------
# ПРОФИЛЬ
# -----------------------------

@app.get("/profile")
async def profile():

    return {
        "login": "ava",
        "mail": "ava@mail.ru"
    }


# -----------------------------
# ВЫХОД
# -----------------------------

@app.post("/logout")
async def logout():

    return {
        "success": True
    }