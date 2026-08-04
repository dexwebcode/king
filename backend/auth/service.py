# ФАЙЛ: backend/auth/service.py
# КОМЕНТАРИЙ: Сервис для аутентификации пользователей

# PYTHON ИПОРТЫ
from sqlalchemy.exc import IntegrityError

# ЛОКАЛЬНЫЕ ИПОРТЫ
from backend.core.database import SessionLocal
from .repository import (
    create_user,
    get_user_by_login_or_email,
)
from .security import (
    create_access_token,
    hash_md5_password,
)

# Исключение: пользователь уже существует
class UserAlreadyExistsError(Exception):
    pass

# функция для аутентификации пользователя
def login_user(
    email: str,
    password: str,
) -> dict | None:

    session = SessionLocal()

    try:

        user = get_user_by_login_or_email(
            session=session,
            login_or_email=email,
        )

        if user is None:
            return None

        entered_password_hash = hash_md5_password(password)

        if user["password"] != entered_password_hash:
            return None

        token = create_access_token(user["id"])

        return {
            "user_id": user["id"],
            "email": user["mail"],
            "token": token,
        }

    finally:
        session.close()

# функция для регистрации пользователя
def register_user(
    email: str,
    password: str,
) -> dict:

    session = SessionLocal()

    try:

        # Предварительно проверяем существование пользователя
        existing_user = get_user_by_login_or_email(
            session=session,
            login_or_email=email,
        )

        if existing_user is not None:
            raise UserAlreadyExistsError

        # Хешируем пароль
        password_hash = hash_md5_password(password)

        try:

            # Создаём пользователя
            user = create_user(
                session=session,
                login=email,
                email=email,
                password=password_hash,
            )

        except IntegrityError as error:

            # Откатываем транзакцию
            session.rollback()

            # PostgreSQL отклонил повторяющуюся почту
            raise UserAlreadyExistsError from error

        if user is None:
            raise RuntimeError(
                "База данных не вернула созданного пользователя"
            )

        # Создаём токен доступа
        token = create_access_token(user["id"])

        return {
            "user_id": user["id"],
            "email": user["mail"],
            "token": token,
        }

    finally:
        session.close()