# ФАЙЛ: backend/auth/service.py
# КОМЕНТАРИЙ: Сервис для аутентификации пользователей

# PYTHON ИПОРТЫ
from backend.core.database import SessionLocal

# ЛОКАЛЬНЫЕ ИПОРТЫ
from .repository import get_user_by_login_or_email
from .security import create_access_token, hash_md5_password

# функция для аутентификации пользователя
def login_user(login_or_email: str, password: str) -> dict | None:
    session = SessionLocal()

    try:
        # Получаем пользователя по логину или email
        user = get_user_by_login_or_email(
            session=session,
            login_or_email=login_or_email,
        )

        # Если пользователь не найден, возвращаем None
        if user is None:
            return None

        # Проверяем хэш пароля
        entered_password_hash = hash_md5_password(password)

        if user["password"] != entered_password_hash:
            return None

        # Генерируем токен доступа
        token = create_access_token(user["id"])

        # Возвращаем информацию о пользователе и токен
        return {
            "user_id": user["id"],
            "login": user["login"],
            "token": token,
        }

    finally:
        session.close()