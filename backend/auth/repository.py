# ФАЙЛ: backend/auth/repository.py
# КОМЕНТАРИЙ: Файл содержит функции для взаимодействия с базой данных.

# PYTHON ИМПОРТЫ
from sqlalchemy import text
from sqlalchemy.orm import Session


# Определение функции для получения пользователя по логину или почте
def get_user_by_login_or_email(
    session: Session,
    login_or_email: str,
):
    result = session.execute(
        text("""
            SELECT id, login, mail, password, token_version
            FROM migration_temp.users
            WHERE LOWER(login) = LOWER(:value)
               OR LOWER(mail) = LOWER(:value)
            LIMIT 1
        """),
        {
            "value": login_or_email,
        },
    )

    return result.mappings().first()


def get_user_by_login(session: Session, login: str):
    result = session.execute(
        text("""
            SELECT id, login, mail, password
            FROM migration_temp.users
            WHERE LOWER(login) = LOWER(:login)
            LIMIT 1
        """),
        {"login": login},
    )
    return result.mappings().first()


def get_user_by_email(session: Session, email: str):
    result = session.execute(
        text("""
            SELECT id, login, mail, password
            FROM migration_temp.users
            WHERE LOWER(mail) = LOWER(:email)
            LIMIT 1
        """),
        {"email": email},
    )
    return result.mappings().first()


# Определение функции для получения пользователя по идентификатору
def get_user_by_id(
    session: Session,
    user_id: int,
):
    result = session.execute(
        text("""
            SELECT id, login, mail, token_version
            FROM migration_temp.users
            WHERE id = :user_id
            LIMIT 1
        """),
        {
            "user_id": user_id,
        },
    )

    return result.mappings().first()


# Определение функции для добавления пользователя
def create_user(
    session: Session,
    login: str | None,
    email: str | None,
    password: str | None,
):
    result = session.execute(
            text("""
                INSERT INTO migration_temp.users (
                    login,
                    mail,
                    password
                )
                VALUES (
                    :login,
                    :email,
                    :password
                )
                RETURNING
                    id,
                    login,
                    mail
            """),
            {
                "login": login,
                "email": email,
                "password": password,
            },
        )
    return result.mappings().first()


def update_user_password(session: Session, user_id: int, password: str) -> None:
    session.execute(
        text("""
            UPDATE migration_temp.users
            SET password = :password
            WHERE id = :user_id
        """),
        {"user_id": user_id, "password": password},
    )


def increment_user_token_version(session: Session, user_id: int) -> None:
    """Инвалидирует все ранее выпущенные токены пользователя."""
    session.execute(
        text("""
            UPDATE migration_temp.users
            SET token_version = token_version + 1
            WHERE id = :user_id
        """),
        {"user_id": user_id},
    )


def count_legacy_password_hashes(session: Session) -> int:
    """Число аккаунтов со старым MD5-хешем (без префикса pbkdf2_sha256$)."""
    result = session.execute(
        text("""
            SELECT COUNT(*)
            FROM migration_temp.users
            WHERE password IS NOT NULL
              AND btrim(password) <> ''
              AND password NOT LIKE 'pbkdf2_sha256$%'
        """),
    )
    return int(result.scalar_one())
