from backend.core.database import SessionLocal

from .repository import get_user_by_login_or_email
from .security import create_access_token, hash_md5_password


def login_user(login_or_email: str, password: str) -> dict | None:
    session = SessionLocal()

    try:
        user = get_user_by_login_or_email(
            session=session,
            login_or_email=login_or_email,
        )

        if user is None:
            return None

        entered_password_hash = hash_md5_password(password)

        if user["password"] != entered_password_hash:
            return None

        token = create_access_token(user["id"])

        return {
            "user_id": user["id"],
            "login": user["login"],
            "token": token,
        }

    finally:
        session.close()