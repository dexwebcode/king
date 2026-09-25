"""REST API аккаунта: /api/account/*."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from backend.auth.dependencies import get_current_user

from .schemas import AddEmailRequest, SetCredentialsRequest, VerifyPasswordRequest
from .service import (
    AccountService,
    CurrentPasswordError,
    EmailAlreadyUsedError,
    InvalidProviderError,
    LastLoginMethodError,
    LoginAlreadyUsedError,
    PasswordRequiredError,
    ProviderNotConnectedError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/account", tags=["Аккаунт"])

_UNAVAILABLE_DETAIL = "Аккаунт временно недоступен. Попробуйте позже."


@router.get("")
def get_account_endpoint(current_user: dict = Depends(get_current_user)):
    try:
        return AccountService.get_account(current_user["id"])
    except SQLAlchemyError as error:
        logger.exception("Account read failed user_id=%s", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_UNAVAILABLE_DETAIL,
        ) from error


@router.post("/email", status_code=status.HTTP_201_CREATED)
def add_email_endpoint(
    data: AddEmailRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = AccountService.add_email(current_user["id"], str(data.email))
    except EmailAlreadyUsedError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except SQLAlchemyError as error:
        logger.exception("Account email update failed user_id=%s", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_UNAVAILABLE_DETAIL,
        ) from error
    return {"success": True, **result}


@router.post("/verify-password")
def verify_password_endpoint(
    data: VerifyPasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """Подтверждение личности перед сменой логина и пароля."""
    try:
        return AccountService.verify_current_password(
            current_user["id"], data.current_password
        )
    except CurrentPasswordError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError as error:
        logger.exception("Password check failed user_id=%s", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_UNAVAILABLE_DETAIL,
        ) from error


@router.post("/credentials")
def set_credentials_endpoint(
    data: SetCredentialsRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        result = AccountService.set_credentials(
            current_user["id"],
            login=data.login,
            password=data.password,
            current_password=data.current_password,
        )
    except LoginAlreadyUsedError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except (CurrentPasswordError, PasswordRequiredError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError as error:
        logger.exception("Account credentials update failed user_id=%s", current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_UNAVAILABLE_DETAIL,
        ) from error
    return {"success": True, **result}


@router.delete("/connections/{provider}")
def disconnect_provider_endpoint(
    provider: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        return AccountService.disconnect_provider(current_user["id"], provider)
    except InvalidProviderError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except ProviderNotConnectedError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except LastLoginMethodError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except SQLAlchemyError as error:
        logger.exception("Account disconnect failed user_id=%s provider=%s", current_user["id"], provider)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_UNAVAILABLE_DETAIL,
        ) from error
