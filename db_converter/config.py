# ФАЙЛ: db_converter/config/config.py — Конфигурация данных проекта

from dataclasses import dataclass
from pathlib import Path

# -----------------------------------------------------------------------------
# Пути проекта
# -----------------------------------------------------------------------------

# Получаем абсолютный путь к текущей папке (db_converter)
PROJECT_DIR = Path(__file__).resolve().parent.parent

@dataclass(frozen=True)
class PathsConfig:
    """Пути к основным директориям проекта."""
    project: Path = PROJECT_DIR
    dumps: Path = PROJECT_DIR / "dumps"
    logs: Path = PROJECT_DIR / "logs"
    backups: Path = PROJECT_DIR / "backups"
    temp: Path = PROJECT_DIR / "temp"

@dataclass(frozen=True)
class MariaDBConfig:
    """Настройки подключения к MariaDB."""
    host: str = "localhost"
    port: int = 3306
    user: str = "converter"
    password: str = "converter123"

@dataclass(frozen=True)
class PostgreSQLConfig:
    """Настройки подключения к PostgreSQL."""
    host: str = "localhost"
    port: int = 5432
    user: str = "king"
    password: str = "king123"

@dataclass(frozen=True)
class LoggerConfig:
    """Настройки логирования."""
    # Можно использовать путь из PathsConfig, если нужно
    log_dir: Path = PROJECT_DIR / "logs"
    filename: str = "converter.log"

@dataclass(frozen=True)
class AppConfig:
    """Общие настройки приложения."""
    timeout: int = 600
    force_remove: bool = False
    validate_rows: bool = True
    validate_tables: bool = True

@dataclass(frozen=True)
class Config:
    """Главная конфигурация приложения, объединяющая все подконфиги."""
    paths: PathsConfig = PathsConfig()
    mariadb: MariaDBConfig = MariaDBConfig()
    postgres: PostgreSQLConfig = PostgreSQLConfig()
    logger: LoggerConfig = LoggerConfig()
    app: AppConfig = AppConfig()

# Единственный экземпляр конфигурации проекта (Синглтон)
config = Config()