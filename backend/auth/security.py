# ФАЙЛ: backend/auth/security.py
# КОМЕНТАРИЙ:
#       Файл содержит функции для хеширования паролей, создания и декодирования
#       JWT-токенов для аутентификации пользователей в приложении FastAPI.


# PYTHON ИМПОРТЫ
import hashlib
import hmac
import secrets
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


PBKDF2_ALGORITHM = "sha256"
PBKDF2_ITERATIONS = 600_000
PBKDF2_PREFIX = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    """Creates a salted, versioned password hash for new credentials."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt.encode("ascii"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"{PBKDF2_PREFIX}${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False

    if not stored_hash.startswith(f"{PBKDF2_PREFIX}$"):
        return hmac.compare_digest(hash_md5_password(password), stored_hash)

    try:
        prefix, raw_iterations, salt, expected = stored_hash.split("$", 3)
        iterations = int(raw_iterations)
    except (TypeError, ValueError):
        return False

    if prefix != PBKDF2_PREFIX or iterations <= 0:
        return False

    actual = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt.encode("ascii"),
        iterations,
    ).hex()
    return hmac.compare_digest(actual, expected)


def password_needs_rehash(stored_hash: str | None) -> bool:
    if not stored_hash or not stored_hash.startswith(f"{PBKDF2_PREFIX}$"):
        return True

    try:
        return int(stored_hash.split("$", 3)[1]) < PBKDF2_ITERATIONS
    except (IndexError, ValueError):
        return True

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
