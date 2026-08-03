# ФАЙЛ: backend/auth/repository.py
# КОМЕНТАРИЙ:
#       Файл содержит функции для взаимодействия с базой данных.

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
            SELECT id, login, mail, password
            FROM users
            WHERE login = :value
               OR mail = :value
            LIMIT 1
        """),
        {
            "value": login_or_email,
        },
    )

    return result.mappings().first()


# Определение функции для получения пользователя по идентификатору
def get_user_by_id(
    session: Session,
    user_id: int,
):
    result = session.execute(
        text("""
            SELECT id, login, mail
            FROM users
            WHERE id = :user_id
            LIMIT 1
        """),
        {
            "user_id": user_id,
        },
    )

    return result.mappings().first()