from sqlalchemy import text

from database import SessionLocal

import hashlib

def main():
    # Создаем сессию
    session = SessionLocal()
    login = "admin"
    password = hashlib.md5("Yej39ep2gdy26@".encode("utf-8")).hexdigest()
    try:
        # Выполняем SQL-запрос для получения всех пользователей
        result = session.execute(text(
            """
            SELECT id, login, mail, password
            FROM users
            WHERE login = :login or mail =:login
            """),
            {"login": login})

        users = result.mappings().first()

        if users is None:
            print("Пользователь не найден")
            return

        if users['password'] != password:
            print("Неверный пароль")
            return

        print('Добро подаловать,', users['login'])
    finally:
        # Закрываем сессию
        session.close()

if __name__ == "__main__":
    main()