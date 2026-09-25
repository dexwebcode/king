"""Pydantic-схемы аккаунта."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from backend.auth.schemas import validate_login_value, validate_password_value


class AddEmailRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value


class VerifyPasswordRequest(BaseModel):
    """Проверка текущего пароля перед сменой данных аккаунта."""

    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=200)


class SetCredentialsRequest(BaseModel):
    """Задание логина и пароля для входа без соцсетей."""

    model_config = ConfigDict(extra="forbid")

    login: str = Field(min_length=3, max_length=40)
    # Новый пароль. Пустое значение = пароль не меняем.
    password: str | None = Field(default=None, max_length=100)
    # Текущий пароль обязателен, если у аккаунта пароль уже есть.
    current_password: str | None = Field(default=None, max_length=200)

    @field_validator("login", mode="before")
    @classmethod
    def _validate_login(cls, value):
        if isinstance(value, str):
            return validate_login_value(value)
        return value

    @field_validator("password")
    @classmethod
    def _validate_password(cls, value):
        if value is None or value == "":
            return None
        return validate_password_value(value)

    @field_validator("current_password", mode="before")
    @classmethod
    def _clean_current_password(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            return value or None
        return value
