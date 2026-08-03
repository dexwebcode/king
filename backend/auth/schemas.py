# ФАЙЛ: backend/auth/schemas.py
# КОМЕНТАРИЙ:
#       Схема для регистрации пользователя чтобы проверить корректность данных и их типы
#       сразу в момент получения запроса. Также используется для проверки данных
#       при логине пользователя.

# PYTHON ИМПОРТЫ
from pydantic import BaseModel

# Схемы для логина пользователя
class LoginRequest(BaseModel):
    login: str
    password: str

# Схемы для регистрации пользователя
class RegisterRequest(BaseModel):
    login: str
    password: str

# Схемы для проверки логина пользователя
class CheckLoginRequest(BaseModel):
    login: str