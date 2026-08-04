# ФАЙЛ: backend/auth/schemas.py
# КОМЕНТАРИЙ:
#       Файл содержит схемы проверки входящих данных для регистрации
#       и авторизации пользователей.

# PYTHON ИМПОРТЫ
from pydantic import BaseModel, EmailStr, field_validator


# Базовая схема электронной почты
class EmailRequest(BaseModel):

    email: EmailStr

    # Нормализация электронной почты
    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:

        if not isinstance(value, str):
            return value

        return value.strip().lower()


# Схема для авторизации пользователя
class LoginRequest(EmailRequest):

    password: str

    # Минимальная проверка пароля при входе
    @field_validator("password")
    @classmethod
    def validate_login_password(cls, value: str) -> str:

        if not value:
            raise ValueError(
                "Пароль не может быть пустым"
            )

        if len(value) > 100:
            raise ValueError(
                "Пароль слишком длинный"
            )

        return value


# Схема для регистрации пользователя
class RegisterRequest(EmailRequest):

    password: str

    # Полная проверка нового пароля
    @field_validator("password")
    @classmethod
    def validate_register_password(cls, value: str) -> str:

        if len(value) < 6:
            raise ValueError(
                "Пароль должен содержать минимум 6 символов"
            )

        if len(value) > 100:
            raise ValueError(
                "Пароль слишком длинный"
            )

        if not any(symbol.islower() for symbol in value):
            raise ValueError(
                "Пароль должен содержать строчную букву"
            )

        if not any(symbol.isupper() for symbol in value):
            raise ValueError(
                "Пароль должен содержать заглавную букву"
            )

        if not any(symbol.isdigit() for symbol in value):
            raise ValueError(
                "Пароль должен содержать цифру"
            )

        if any(symbol.isspace() for symbol in value):
            raise ValueError(
                "Пароль не должен содержать пробелы"
            )

        return value


# Схема проверки электронной почты
class CheckEmailRequest(EmailRequest):
    pass