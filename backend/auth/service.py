# ФАЙЛ: backend/auth/service.py
# КОМЕНТАРИЙ: Сервис для аутентификации пользователей

# PYTHON ИПОРТЫ
from sqlalchemy.exc import IntegrityError

# ЛОКАЛЬНЫЕ ИПОРТЫ
from backend.core.database import SessionLocal
from .repository import (
    create_user,
    get_user_by_email,
    get_user_by_login,
    get_user_by_login_or_email,
    update_user_password,
)
from .security import (
    create_access_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)

# Исключение: пользователь уже существует
class UserAlreadyExistsError(Exception):
    pass

# функция для аутентификации пользователя
def login_user(
    login_or_email: str,
    password: str,
) -> dict | None:

    session = SessionLocal()

    try:

        user = get_user_by_login_or_email(
            session=session,
            login_or_email=login_or_email,
        )

        if user is None:
            return None

        if not verify_password(password, user["password"]):
            return None

        if password_needs_rehash(user["password"]):
            update_user_password(session, user["id"], hash_password(password))
            session.commit()

        token = create_access_token(user["id"])

        return {
            "user_id": user["id"],
            "login": user["login"],
            "email": user["mail"],
            "token": token,
        }

    finally:
        session.close()

# функция для регистрации пользователя
def register_user(
    login: str,
    email: str,
    password: str,
) -> dict:

    session = SessionLocal()

    try:

        # Предварительно проверяем существование пользователя
        if get_user_by_login(session, login) is not None:
            raise UserAlreadyExistsError("login")
        if get_user_by_email(session, email) is not None:
            raise UserAlreadyExistsError("email")

        # Хешируем пароль
        password_hash = hash_password(password)

        try:

            # Создаём пользователя
            user = create_user(
                session=session,
                login=login,
                email=email,
                password=password_hash,
            )
            session.commit()

        except IntegrityError as error:

            # Откатываем транзакцию
            session.rollback()

            # PostgreSQL отклонил повторяющуюся почту
            raise UserAlreadyExistsError("credentials") from error

        if user is None:
            raise RuntimeError(
                "База данных не вернула созданного пользователя"
            )

        # Создаём токен доступа
        token = create_access_token(user["id"])

        return {
            "user_id": user["id"],
            "login": user["login"],
            "email": user["mail"],
            "token": token,
        }

    finally:
        session.close()
