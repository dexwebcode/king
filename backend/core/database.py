# ФАЙЛ: backend/core/database.py
# КОМЕНТАРИЙ: Этот файл содержит настройки подключения к базе данных и создание сессий SQLAlchemy.

# PYTHON ИМПОРТЫ
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ЛОКАЛЬНЫЕ ИМПОРТЫ
from .config import DATABASE_URL

# Создание движка SQLAlchemy с использованием URL базы данных из конфигурации
engine = create_engine(
    DATABASE_URL,
    echo=True,
    pool_pre_ping=True,
)

# Создание локальной сессии SQLAlchemy для взаимодействия с базой данных
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)