# ФАЙЛ: backend/auth/routers/telegram.py
#
# Содержит HTTP-endpoints Telegram-авторизации: создание и проверку
# Telegram-сессий, регистрацию нового аккаунта и привязку существующего.

# PYTHON ИМПОРТЫ
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.auth.dependencies import get_current_user
from backend.auth.repository import (
    create_user,
    get_user_by_id,
    get_user_by_login_or_email,
)
from backend.auth.schemas import (
    TelegramCompleteRegisterRequest,
    TelegramLinkExistingRequest,
    TelegramStartRequest,
)
from backend.auth.security import (
    create_access_token,
    hash_md5_password,
)
from backend.auth.social_accounts import (
    get_user_social_account_by_provider_user_id,
    upsert_user_social_account,
)
from backend.auth.telegram_sessions import (
    complete_telegram_auth_session,
    create_telegram_auth_session,
    get_telegram_auth_session,
)
from backend.core.database import get_db


router = APIRouter()


# Нормализует дату из БД к UTC для корректного сравнения срока сессии.
def normalize_datetime(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value


# Формирует предлагаемый логин для нового Telegram-пользователя.
def get_telegram_login(telegram_id: int, telegram_username: str | None) -> str:
    if telegram_username:
        return telegram_username.lower()

    return f"telegram_{telegram_id}"


# Создаёт Telegram-сессию для уже авторизованного пользователя.
@router.post("/telegram/session")
def telegram_session(
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    result = create_telegram_auth_session(
        session=session,
        user_id=current_user["id"],
    )

    return {
        "success": True,
        **result,
    }


# Создаёт Telegram-сессию для гостевого входа.
@router.post("/telegram/guest/session")
def telegram_guest_session(session: Session = Depends(get_db)):
    result = create_telegram_auth_session(
        session=session,
        user_id=None,
    )

    return {
        "success": True,
        **result,
    }


# Возвращает статус гостевой Telegram-сессии и завершает вход при успехе.
@router.get("/telegram/guest/status")
def telegram_guest_status(
    token: str,
    session: Session = Depends(get_db),
):
    # Получаем сохранённую Telegram-сессию по её токену.
    auth_session = get_telegram_auth_session(
        session=session,
        token=token,
    )

    if auth_session is None:
        return {
            "success": True,
            "status": "not_found",
            "authorized": False,
            "message": "Telegram-сессия не найдена",
        }

    # Проверяем, не истекла ли ожидающая подтверждения сессия.
    expires_at = normalize_datetime(auth_session["expires_at"])

    if (
        auth_session["status"] == "pending"
        and expires_at < datetime.now(timezone.utc)
    ):
        return {
            "success": True,
            "status": "expired",
            "authorized": False,
            "message": "Telegram-сессия истекла",
        }

    if auth_session["status"] != "authorized":
        return {
            "success": True,
            "status": auth_session["status"],
            "authorized": False,
        }

    # Telegram подтверждён: проверяем существующую привязку аккаунта.
    telegram_id = auth_session["telegram_id"]
    telegram_username = auth_session["telegram_username"]

    social_account = get_user_social_account_by_provider_user_id(
        session=session,
        provider="telegram",
        provider_user_id=str(telegram_id),
    )

    if social_account is not None:
        # Находим KingPromotion-пользователя, привязанного к Telegram.
        user = get_user_by_id(session, social_account["user_id"])

        if user is None:
            return {
                "success": True,
                "status": "authorized",
                "authorized": True,
                "action": "complete_account",
                "telegram": {
                    "id": telegram_id,
                    "username": telegram_username,
                },
            }

        # Для существующего пользователя выдаём JWT.
        return {
            "success": True,
            "status": "authorized",
            "authorized": True,
            "action": "login",
            "token": create_access_token(user["id"]),
            "user": {
                "id": user["id"],
                "email": user["mail"],
            },
        }

    # Для нового пользователя запрашиваем завершение создания аккаунта.
    return {
        "success": True,
        "status": "authorized",
        "authorized": True,
        "action": "complete_account",
        "suggested_login": get_telegram_login(
            telegram_id,
            telegram_username,
        ),
        "telegram": {
            "id": telegram_id,
            "username": telegram_username,
        },
    }


# Обрабатывает подтверждение Telegram из бота и привязывает его к пользователю.
@router.post("/telegram/start")
def telegram_start(
    data: TelegramStartRequest,
    session: Session = Depends(get_db),
):
    # Фиксируем данные Telegram в ожидающей сессии.
    auth_session = complete_telegram_auth_session(
        session=session,
        token=data.token,
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
    )

    if auth_session is None:
        return {
            "success": True,
            "authorized": False,
            "message": "Токен недействителен, уже использован или истёк",
        }

    # Гостевая сессия завершается на frontend после подтверждения в боте.
    user_id = auth_session["user_id"]

    if user_id is None:
        return {
            "success": True,
            "authorized": True,
            "message": "Telegram подтверждён. Вернитесь на сайт для завершения входа.",
        }

    # Проверяем пользователя, который инициировал привязку.
    user = get_user_by_id(session, user_id)

    if user is None:
        return {
            "success": True,
            "authorized": False,
            "message": "Пользователь не найден",
        }

    # Не допускаем привязку Telegram к двум разным пользователям.
    linked_account = get_user_social_account_by_provider_user_id(
        session=session,
        provider="telegram",
        provider_user_id=str(data.telegram_id),
    )

    if linked_account is not None and linked_account["user_id"] != user["id"]:
        return {
            "success": True,
            "authorized": False,
            "message": "Этот Telegram уже привязан к другому аккаунту",
        }

    # Создаём или обновляем привязку Telegram-аккаунта.
    upsert_user_social_account(
        session=session,
        user_id=user["id"],
        provider="telegram",
        provider_user_id=str(data.telegram_id),
        username=data.telegram_username,
    )

    return {
        "success": True,
        "authorized": True,
        "message": "Telegram успешно авторизован",
        "user": {
            "id": user["id"],
            "email": user["mail"],
        },
    }


# Завершает регистрацию нового пользователя после подтверждения Telegram.
@router.post("/telegram/complete-register")
def telegram_complete_register(
    data: TelegramCompleteRegisterRequest,
    session: Session = Depends(get_db),
):
    # Проверяем подтверждённую Telegram-сессию.
    auth_session = get_telegram_auth_session(session=session, token=data.token)

    if auth_session is None or auth_session["status"] != "authorized":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telegram не подтверждён")

    if auth_session["telegram_id"] is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Telegram ID не найден")

    # Проверяем уникальность выбранного логина.
    existing_user = get_user_by_login_or_email(session=session, login_or_email=data.login)

    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с таким логином уже существует")

    # Telegram не должен быть связан с другим аккаунтом.
    linked_account = get_user_social_account_by_provider_user_id(
        session=session, provider="telegram", provider_user_id=str(auth_session["telegram_id"])
    )

    if linked_account is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Этот Telegram уже привязан к аккаунту")

    # Создаём обычного пользователя с техническим Telegram-email.
    try:
        user = create_user(
            session=session,
            login=data.login,
            email=f"telegram_{auth_session['telegram_id']}@telegram.local",
            password=hash_md5_password(data.password),
        )
    except IntegrityError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с таким логином уже существует") from error

    # INSERT с RETURNING обязан вернуть созданного пользователя.
    if user is None:
        raise RuntimeError("База данных не вернула созданного пользователя")

    # Привязываем подтверждённый Telegram к созданному пользователю.
    upsert_user_social_account(
        session=session, user_id=user["id"], provider="telegram",
        provider_user_id=str(auth_session["telegram_id"]), username=auth_session["telegram_username"],
    )

    return {
        "success": True, "token": create_access_token(user["id"]),
        "user": {"id": user["id"], "email": user["mail"]},
    }


# Привязывает Telegram к существующему аккаунту после проверки пароля.
@router.post("/telegram/link-existing")
def telegram_link_existing(
    data: TelegramLinkExistingRequest,
    session: Session = Depends(get_db),
):
    # Проверяем подтверждённую Telegram-сессию.
    auth_session = get_telegram_auth_session(
        session=session,
        token=data.token,
    )

    if auth_session is None or auth_session["status"] != "authorized":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram не подтверждён",
        )

    if auth_session["telegram_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram ID не найден",
        )

    # Ищем пользователя по логину или email и проверяем пароль.
    user = get_user_by_login_or_email(
        session=session,
        login_or_email=data.identifier,
    )

    if user is None or user["password"] != hash_md5_password(data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин, почта или пароль",
        )

    # Не допускаем привязку Telegram к другому пользователю.
    linked_account = get_user_social_account_by_provider_user_id(
        session=session,
        provider="telegram",
        provider_user_id=str(auth_session["telegram_id"]),
    )

    if linked_account is not None and linked_account["user_id"] != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот Telegram уже привязан к другому аккаунту",
        )

    # Сохраняем привязку Telegram-аккаунта.
    upsert_user_social_account(
        session=session,
        user_id=user["id"],
        provider="telegram",
        provider_user_id=str(auth_session["telegram_id"]),
        username=auth_session["telegram_username"],
    )

    return {
        "success": True,
        "token": create_access_token(user["id"]),
        "user": {
            "id": user["id"],
            "email": user["mail"],
        },
    }
