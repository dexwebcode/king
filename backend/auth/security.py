# ФАЙЛ: backend/auth/security.py
# КОМЕНТАРИЙ:
#       Файл содержит функции для хеширования паролей, создания и декодирования
#       JWT-токенов для аутентификации пользователей в приложении FastAPI.


# PYTHON ИМПОРТЫ
import hashlib
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    SECRET_KEY,
)

# Создаёт MD5-хеш для совместимости со старой базой.
def hash_md5_password(password: str) -> str:

    return hashlib.md5(
        password.encode("utf-8")
    ).hexdigest()

# Создаёт JWT для авторизованного пользователя.
def create_access_token(user_id: int) -> str:
    # Создаёт JWT-токен с идентификатором пользователя и временем истечения срока действия.
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )


    payload = {
        "sub": str(user_id),
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

# Проверяет JWT и возвращает ID пользователя.
def decode_access_token(token: str) -> int | None:

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        # Извлекает идентификатор пользователя из полезной нагрузки токена.
        user_id = payload.get("sub")

        if user_id is None:
            return None

        return int(user_id)

    except (JWTError, ValueError):
        return None