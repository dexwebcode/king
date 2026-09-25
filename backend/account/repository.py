"""SQL-запросы для раздела «Аккаунт»."""

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_user_account(session: Session, user_id: int):
    return session.execute(
        text("""
            SELECT
                id,
                login,
                mail,
                email_verified,
                (password IS NOT NULL AND btrim(password) <> '') AS has_password
            FROM migration_temp.users
            WHERE id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id},
    ).mappings().first()


def find_user_by_email(session: Session, email: str):
    return session.execute(
        text("""
            SELECT id
            FROM migration_temp.users
            WHERE LOWER(mail) = LOWER(:email)
            LIMIT 1
        """),
        {"email": email},
    ).mappings().first()


def set_user_email(session: Session, user_id: int, email: str):
    return session.execute(
        text("""
            UPDATE migration_temp.users
            SET mail = :email,
                email_verified = FALSE
            WHERE id = :user_id
            RETURNING id, login, mail, email_verified
        """),
        {"user_id": user_id, "email": email},
    ).mappings().first()


def get_user_for_credentials(session: Session, user_id: int):
    """Только для проверки пароля: хеш никогда не покидает backend."""
    return session.execute(
        text("""
            SELECT id, login, password
            FROM migration_temp.users
            WHERE id = :user_id
            LIMIT 1
        """),
        {"user_id": user_id},
    ).mappings().first()


def find_user_by_login(session: Session, login: str):
    return session.execute(
        text("""
            SELECT id
            FROM migration_temp.users
            WHERE LOWER(login) = LOWER(:login)
            LIMIT 1
        """),
        {"login": login},
    ).mappings().first()


def update_user_credentials(
    session: Session,
    user_id: int,
    login: str,
    password_hash: str | None = None,
):
    return session.execute(
        text("""
            UPDATE migration_temp.users
            SET login = :login,
                password = COALESCE(:password_hash, password)
            WHERE id = :user_id
            RETURNING id, login
        """),
        {"user_id": user_id, "login": login, "password_hash": password_hash},
    ).mappings().first()
