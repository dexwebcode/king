# ФАЙЛ: backend/core/config.py
# КОМЕНТАРИЙ:
#       Этот файл содержит конфигурацию для приложения, включая настройки базы
#       данных и параметры безопасности.

# PYTHON ИМПОРТЫ
import os
from dotenv import load_dotenv

# ЛОКАЛЬНЫЕ ИМПОРТЫ
load_dotenv()


DATABASE_URL = os.environ["DATABASE_URL"] # --------> Соединение с базой
SECRET_KEY = os.environ["SECRET_KEY"] # ------------> Секретный ключ для JWT

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256") # ---> Алгоритм для подписи JWT

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440") # ---> Время жизни токена в минутах (по умолчанию 1 день)
)