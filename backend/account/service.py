"""Бизнес-логика аккаунта: способы входа и Email."""

import logging

from sqlalchemy.exc import IntegrityError

from backend.auth.security import hash_password, verify_password
from backend.auth.social_accounts import (
    delete_user_social_account,
    get_user_social_accounts,
)
from backend.core.database import SessionLocal

from . import repository

logger = logging.getLogger(__name__)

VALID_SOCIAL_PROVIDERS = {"telegram", "vk"}


class EmailAlreadyUsedError(Exception):
    pass


class LoginAlreadyUsedError(Exception):
    pass


class CurrentPasswordError(Exception):
    pass


class PasswordRequiredError(Exception):
    pass


class LastLoginMethodError(Exception):
    pass


class ProviderNotConnectedError(Exception):
    pass


class InvalidProviderError(Exception):
    pass


def _provider_label(provider: str) -> str:
    return "Telegram" if provider == "telegram" else "VK"


def _count_login_methods(account: dict, socials: list[dict], excluding: str | None = None) -> int:
    count = 1 if account["has_password"] else 0
    for social in socials:
        if social["provider"] != excluding:
            count += 1
    return count


class AccountService:
    @staticmethod
    def get_account(user_id: int) -> dict:
        session = SessionLocal()
        try:
            account = repository.get_user_account(session, user_id)
            if account is None:
                raise RuntimeError("User not found")
            socials = get_user_social_accounts(session, user_id)
        finally:
            session.close()

        telegram = next((s for s in socials if s["provider"] == "telegram"), None)
        vk = next((s for s in socials if s["provider"] == "vk"), None)

        return {
            "login": account["login"],
            "email": account["mail"],
            "email_verified": bool(account["email_verified"]) if account["mail"] else False,
            "has_password": bool(account["has_password"]),
            "connections": {
                "telegram": {
                    "connected": telegram is not None,
                    "username": telegram["username"] if telegram else None,
                    "display_name": telegram["display_name"] if telegram else None,
                },
                "vk": {
                    "connected": vk is not None,
                    "username": vk["username"] if vk else None,
                    "display_name": vk["display_name"] if vk else None,
                },
            },
        }

    @staticmethod
    def add_email(user_id: int, email: str) -> dict:
        session = SessionLocal()
        try:
            account = repository.get_user_account(session, user_id)
            if account is None:
                raise RuntimeError("User not found")

            # Тот же Email у этого пользователя — ничего не меняем.
            if account["mail"] and account["mail"].lower() == email.lower():
                return {
                    "email": account["mail"],
                    "email_verified": bool(account["email_verified"]),
                }

            existing = repository.find_user_by_email(session, email)
            if existing is not None and int(existing["id"]) != int(user_id):
                raise EmailAlreadyUsedError(
                    "Этот Email уже используется другим аккаунтом."
                )

            try:
                updated = repository.set_user_email(session, user_id, email)
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise EmailAlreadyUsedError(
                    "Этот Email уже используется другим аккаунтом."
                ) from error
        finally:
            session.close()

        logger.info("Account email added user_id=%s", user_id)
        return {
            "email": updated["mail"],
            "email_verified": bool(updated["email_verified"]),
        }

    @staticmethod
    def set_credentials(
        user_id: int,
        *,
        login: str,
        password: str | None = None,
        current_password: str | None = None,
    ) -> dict:
        """Задаёт логин и/или пароль для входа без соцсетей."""
        session = SessionLocal()
        try:
            account = repository.get_user_for_credentials(session, user_id)
            if account is None:
                raise RuntimeError("User not found")
            has_password = bool(account["password"])

            # Смена существующего пароля требует подтверждения текущим.
            if has_password and password:
                if not current_password:
                    raise CurrentPasswordError("Введите текущий пароль.")
                if not verify_password(current_password, account["password"]):
                    raise CurrentPasswordError("Неверный текущий пароль.")

            # Логин без пароля не является рабочим способом входа.
            if not has_password and not password:
                raise PasswordRequiredError(
                    "Задайте пароль, чтобы вход по логину заработал."
                )

            existing = repository.find_user_by_login(session, login)
            if existing is not None and int(existing["id"]) != int(user_id):
                raise LoginAlreadyUsedError("Этот логин уже занят другим аккаунтом.")

            password_hash = hash_password(password) if password else None
            try:
                updated = repository.update_user_credentials(
                    session, user_id, login, password_hash
                )
                session.commit()
            except IntegrityError as error:
                session.rollback()
                raise LoginAlreadyUsedError(
                    "Этот логин уже занят другим аккаунтом."
                ) from error
        finally:
            session.close()

        logger.info("Account credentials updated user_id=%s", user_id)
        return {"login": updated["login"], "has_password": True}

    @staticmethod
    def verify_current_password(user_id: int, current_password: str) -> dict:
        """Проверяет текущий пароль, ничего не меняя."""
        session = SessionLocal()
        try:
            account = repository.get_user_for_credentials(session, user_id)
            if account is None:
                raise RuntimeError("User not found")
            if not account["password"]:
                raise CurrentPasswordError("У аккаунта ещё нет пароля.")
            if not verify_password(current_password, account["password"]):
                raise CurrentPasswordError("Неверный пароль.")
        finally:
            session.close()

        return {"verified": True}

    @staticmethod
    def disconnect_provider(user_id: int, provider: str) -> dict:
        if provider not in VALID_SOCIAL_PROVIDERS:
            raise InvalidProviderError("Недопустимый способ входа")

        session = SessionLocal()
        try:
            account = repository.get_user_account(session, user_id)
            if account is None:
                raise RuntimeError("User not found")
            socials = get_user_social_accounts(session, user_id)

            if not any(s["provider"] == provider for s in socials):
                raise ProviderNotConnectedError(
                    f"{_provider_label(provider)} не подключён"
                )

            if _count_login_methods(account, socials, excluding=provider) == 0:
                raise LastLoginMethodError(
                    "Нельзя отключить единственный доступный способ входа. "
                    "Сначала подключите другой способ авторизации."
                )

            delete_user_social_account(session, user_id, provider)
            session.commit()
        finally:
            session.close()

        logger.info("Account provider disconnected user_id=%s provider=%s", user_id, provider)
        return {"success": True}
