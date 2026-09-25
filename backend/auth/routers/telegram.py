"""Passwordless Telegram login and authenticated account linking."""

import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user
from backend.auth.repository import get_user_by_id
from backend.auth.schemas import TelegramStartRequest
from backend.auth.security import create_access_token
from backend.auth.social_accounts import (
    create_user_social_account,
    get_user_social_account_by_provider_user_id,
    update_user_social_account_profile,
)
from backend.auth.social_auth import SocialAccountBrokenError, authenticate_social_user
from backend.auth.telegram_notifier import send_registration_welcome
from backend.auth.telegram_sessions import (
    claim_authorized_telegram_guest_session,
    complete_telegram_auth_session,
    create_telegram_auth_session,
    finish_telegram_guest_session_redemption,
    get_telegram_auth_session,
    release_telegram_guest_session_redemption,
)
from backend.core.config import TELEGRAM_BOT_BACKEND_SECRET
from backend.core.database import get_db


router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_datetime(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@router.post("/telegram/session")
def telegram_session(
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    return {
        "success": True,
        **create_telegram_auth_session(session=session, user_id=current_user["id"]),
    }


@router.get("/telegram/session/status")
def telegram_session_status(
    token: str,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    """Статус привязки Telegram к уже авторизованному аккаунту (CONNECT)."""
    auth_session = get_telegram_auth_session(session=session, token=token)
    if (
        auth_session is None
        or auth_session["user_id"] is None
        or int(auth_session["user_id"]) != int(current_user["id"])
    ):
        return {"success": True, "status": "not_found"}

    if _normalize_datetime(auth_session["expires_at"]) < datetime.now(timezone.utc):
        return {"success": True, "status": "expired"}

    if auth_session["status"] != "authorized":
        return {"success": True, "status": "pending"}

    telegram_id = auth_session["telegram_id"]
    if telegram_id is None:
        return {"success": True, "status": "pending"}

    linked = get_user_social_account_by_provider_user_id(
        session, "telegram", str(telegram_id)
    )
    if linked is not None and int(linked["user_id"]) == int(current_user["id"]):
        return {
            "success": True,
            "status": "connected",
            "username": linked.get("username"),
        }
    return {"success": True, "status": "conflict"}


@router.post("/telegram/guest/session")
def telegram_guest_session(session: Session = Depends(get_db)):
    return {
        "success": True,
        **create_telegram_auth_session(session=session, user_id=None),
    }


@router.get("/telegram/guest/status")
def telegram_guest_status(
    token: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_db),
):
    auth_session = claim_authorized_telegram_guest_session(
        session=session,
        token=token,
    )
    session_was_claimed = auth_session is not None
    if not session_was_claimed:
        auth_session = get_telegram_auth_session(session=session, token=token)
    if auth_session is None:
        return {
            "success": True,
            "status": "not_found",
            "authorized": False,
            "message": "Telegram-сессия не найдена",
        }

    if _normalize_datetime(auth_session["expires_at"]) < datetime.now(timezone.utc):
        return {
            "success": True,
            "status": "expired",
            "authorized": False,
            "message": "Telegram-сессия истекла",
        }

    if not session_was_claimed:
        public_status = (
            "processing" if auth_session["status"] == "redeeming" else auth_session["status"]
        )
        return {
            "success": True,
            "status": public_status,
            "authorized": False,
            "message": (
                "Telegram-сессия уже использована"
                if auth_session["status"] == "consumed"
                else None
            ),
        }

    telegram_id = auth_session["telegram_id"]
    if telegram_id is None:
        raise HTTPException(status_code=400, detail="Telegram ID не найден")

    try:
        user, created = authenticate_social_user(
            session,
            provider="telegram",
            provider_user_id=str(telegram_id),
            username=auth_session.get("telegram_username"),
            display_name=auth_session.get("telegram_display_name"),
        )
    except SocialAccountBrokenError as error:
        session.rollback()
        release_telegram_guest_session_redemption(session, auth_session["id"])
        raise HTTPException(status_code=409, detail="Связь Telegram повреждена") from error
    except Exception:
        session.rollback()
        release_telegram_guest_session_redemption(session, auth_session["id"])
        raise

    if not finish_telegram_guest_session_redemption(session, auth_session["id"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Telegram-сессия уже использована",
        )

    if created:
        background_tasks.add_task(send_registration_welcome, telegram_id)

    return {
        "success": True,
        "status": "authorized",
        "authorized": True,
        "action": "login",
        "created": created,
        "token": create_access_token(user["id"]),
        "user": {
            "id": user["id"],
            "login": user["login"],
            "email": user["mail"],
        },
    }


@router.post("/telegram/start")
def telegram_start(
    data: TelegramStartRequest,
    x_telegram_bot_secret: str | None = Header(default=None),
    session: Session = Depends(get_db),
):
    if not x_telegram_bot_secret or not secrets.compare_digest(
        x_telegram_bot_secret, TELEGRAM_BOT_BACKEND_SECRET
    ):
        logger.warning("telegram_auth_failed reason=invalid_bot_secret")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bot authentication failed",
        )

    display_name = " ".join(filter(None, [data.first_name, data.last_name])) or None
    auth_session = complete_telegram_auth_session(
        session=session,
        token=data.token,
        telegram_id=data.telegram_id,
        telegram_username=data.telegram_username,
        telegram_display_name=display_name,
    )
    if auth_session is None:
        return {
            "success": True,
            "authorized": False,
            "message": "Токен недействителен, уже использован или истёк",
        }

    user_id = auth_session["user_id"]
    if user_id is None:
        return {
            "success": True,
            "authorized": True,
            "message": "Telegram подтверждён. Вернитесь на сайт.",
        }

    user = get_user_by_id(session, user_id)
    if user is None:
        return {"success": True, "authorized": False, "message": "Пользователь не найден"}

    linked = get_user_social_account_by_provider_user_id(
        session, "telegram", str(data.telegram_id)
    )
    if linked is not None and linked["user_id"] != user["id"]:
        return {
            "success": True,
            "authorized": False,
            "message": "Этот Telegram уже привязан к другому аккаунту",
        }

    try:
        if linked is None:
            create_user_social_account(
                session,
                user["id"],
                "telegram",
                str(data.telegram_id),
                data.telegram_username,
                display_name,
            )
        else:
            update_user_social_account_profile(
                session,
                provider="telegram",
                provider_user_id=str(data.telegram_id),
                username=data.telegram_username,
                display_name=display_name,
            )
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="К аккаунту уже привязан другой Telegram",
        ) from error

    return {
        "success": True,
        "authorized": True,
        "message": "Telegram успешно привязан",
        "user": {"id": user["id"], "login": user["login"], "email": user["mail"]},
    }
