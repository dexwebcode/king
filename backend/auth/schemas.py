# ФАЙЛ: backend/auth/schemas.py
# КОМЕНТАРИЙ:
#       Файл содержит схемы проверки входящих данных для регистрации
#       и авторизации пользователей.

# PYTHON ИМПОРТЫ
from pydantic import BaseModel, EmailStr, field_validator


def normalize_identifier(value: str) -> str:
    identifier = value.strip()

    if not identifier:
        raise ValueError(
            "Введите логин или почту"
        )

    return identifier.lower()


def validate_login_value(value: str) -> str:
    login = value.strip()

    if len(login) < 3:
        raise ValueError(
            "Логин должен содержать минимум 3 символа"
        )

    if len(login) > 50:
        raise ValueError(
            "Логин слишком длинный"
        )

    if any(symbol.isspace() for symbol in login):
        raise ValueError(
            "Логин не должен содержать пробелы"
        )

    return login.lower()


def normalize_token(value: str) -> str:
    token = value.strip()

    if not token:
        raise ValueError(
            "Токен не может быть пустым"
        )

    return token


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
class LoginRequest(BaseModel):

    identifier: str
    password: str

    @field_validator("identifier")
    @classmethod
    def validate_login_identifier(cls, value: str) -> str:
        return normalize_identifier(value)

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


# Схема привязки Telegram через токен из ссылки /start
class TelegramStartRequest(BaseModel):

    token: str
    telegram_id: int
    telegram_username: str | None = None

    @field_validator("token")
    @classmethod
    def validate_telegram_token(cls, value: str) -> str:
        return normalize_token(value)


class TelegramCompleteRegisterRequest(BaseModel):

    token: str
    login: str
    password: str

    @field_validator("login")
    @classmethod
    def validate_telegram_login(cls, value: str) -> str:
        return validate_login_value(value)

    @field_validator("token")
    @classmethod
    def validate_telegram_token(cls, value: str) -> str:
        return normalize_token(value)

    @field_validator("password")
    @classmethod
    def validate_telegram_password(cls, value: str) -> str:
        return RegisterRequest.validate_register_password(value)


class TelegramLinkExistingRequest(BaseModel):

    identifier: str
    password: str
    token: str

    @field_validator("identifier")
    @classmethod
    def validate_login_identifier(cls, value: str) -> str:
        return normalize_identifier(value)

    @field_validator("token")
    @classmethod
    def validate_telegram_token(cls, value: str) -> str:
        return normalize_token(value)

    @field_validator("password")
    @classmethod
    def validate_login_password(cls, value: str) -> str:
        return LoginRequest.validate_login_password(value)


class VkLoginRequest(BaseModel):

    access_token: str

    @field_validator("access_token")
    @classmethod
    def validate_access_token(cls, value: str) -> str:
        return normalize_token(value)
