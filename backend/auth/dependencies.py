# ФАЙЛ: dependencies.py содержит зависимости для аутентификации и авторизации
#       пользователей в приложении FastAPI.

# КОМЕНТАРИЙ:
#       Файл определяет функцию get_current_user, которая извлекает текущего
#       пользователя из заголовка Authorization, проверяет токен и возвращает
#       информацию о пользователе. Если токен недействителен или пользователь не найден,
#       выбрасывается исключение HTTPException с соответствующим кодом состояния.

# PYTHON ИМПОРТЫ
from fastapi import Header, HTTPException, status

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from backend.core.database import SessionLocal
from .repository import get_user_by_id
from .security import decode_access_token

# Определение зависимости для получения текущего пользователя по токену
def get_current_user(
    authorization: str | None = Header(default=None),
):
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен отсутствует",
        )

    # Разделение заголовка Authorization на схему и токен
    scheme, separator, token = authorization.partition(" ")

    # Проверка корректности заголовка Authorization
    if separator == "" or scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Некорректный заголовок Authorization",
        )

    # Декодирование токена для получения идентификатора пользователя
    user_id = decode_access_token(token)

    # Если идентификатор пользователя равен None, выбрасывается исключение HTTPException
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен недействителен или истёк",
        )

    # Создание сессии базы данных для получения информации о пользователе
    session = SessionLocal()

    try:
        # Получение информации о пользователе по идентификатору из базы данных
        user = get_user_by_id(session, user_id)

        # Если пользователь не найден, выбрасывается исключение HTTPException
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Пользователь не найден",
            )
        
        return dict(user)

    finally:
        session.close()