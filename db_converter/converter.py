import shutil
import subprocess
from pathlib import Path

from .config import config
from .logger import logger

class Converter:

    def __init__(self):

        self.dumps = config.paths.dumps
        self.temp = config.paths.temp

        self.full_dump = self.temp / "full_dump.sql"

    # ----------------------------------------------------

    def run(self):

        logger.info("========== КОНВЕРТАЦИЯ НАЧАТА ==========")

        self.merge_sql_files()

        self.create_mariadb()

        self.import_dump()

        self.create_postgresql()

        self.run_pgloader()

        self.validate()

        self.drop_mariadb()

        self.remove_temp()

        logger.info("========== ГОТОВО ==========")

    # ----------------------------------------------------

    def merge_sql_files(self):
        """
        Объединяет все SQL-файлы из dumps/ в один temp/full_dump.sql.
        """

        logger.info("=" * 60)
        logger.info("Сборка общего SQL-дампа")
        logger.info("=" * 60)

        # Создаем temp/, если его нет
        self.temp.mkdir(parents=True, exist_ok=True)

        # Удаляем старый full_dump.sql
        if self.full_dump.exists():
            logger.debug("Удаляем старый full_dump.sql")
            self.full_dump.unlink()

        # Получаем список всех SQL-файлов
        sql_files = sorted(self.dumps.glob("*.sql"))

        if not sql_files:
            raise FileNotFoundError(
                f"В папке '{self.dumps}' не найдено ни одного .sql файла."
            )

        logger.info(f"Найдено файлов: {len(sql_files)}")

        # Создаем объединенный дамп
        with open(self.full_dump, "wb") as outfile:

            for file in sql_files:

                logger.info(f"Добавление: {file.name}")

                with open(file, "rb") as infile:
                    shutil.copyfileobj(infile, outfile)

                # Добавляем пустую строку между файлами
                outfile.write(b"\n\n")

        logger.info(f"Общий дамп успешно создан:")
        logger.info(self.full_dump)

    # ----------------------------------------------------

    def create_mariadb(self):

        logger.info("Создание временной MariaDB...")

        command = f'''
MYSQL_PWD="{config.mariadb.password}" mariadb \
-h {config.mariadb.host} \
-u {config.mariadb.user} \
-e "
DROP DATABASE IF EXISTS migration_temp;

CREATE DATABASE migration_temp
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
"
'''

        subprocess.run(command, shell=True, check=True)

    # ----------------------------------------------------

    def import_dump(self):

        logger.info("Импорт full_dump.sql...")

        command = f'''
MYSQL_PWD="{config.mariadb.password}" mariadb \
-h {config.mariadb.host} \
-u {config.mariadb.user} \
migration_temp < {self.full_dump}
'''

        subprocess.run(command, shell=True, check=True)

    # ----------------------------------------------------

    def create_postgresql(self):

        logger.info("Создание PostgreSQL...")

        drop = f'''
PGPASSWORD="{config.postgres.password}" psql \
-h {config.postgres.host} \
-U {config.postgres.user} \
-d postgres \
-c "DROP DATABASE IF EXISTS kingpromotion;"
'''

        create = f'''
PGPASSWORD="{config.postgres.password}" psql \
-h {config.postgres.host} \
-U {config.postgres.user} \
-d postgres \
-c "CREATE DATABASE kingpromotion;"
'''

        subprocess.run(drop, shell=True, check=True)

        subprocess.run(create, shell=True, check=True)

    # ----------------------------------------------------

    def run_pgloader(self):

        logger.info("Запуск pgloader...")

        command = f'''
pgloader \
mysql://{config.mariadb.user}:{config.mariadb.password}@localhost/migration_temp \
postgresql://{config.postgres.user}:{config.postgres.password}@localhost/kingpromotion
'''

        subprocess.run(command, shell=True, check=True)

    # ----------------------------------------------------

    def validate(self):

        logger.info("Проверка данных...")

        logger.info("Проверка будет реализована позже.")

    # ----------------------------------------------------

    def drop_mariadb(self):

        logger.info("Удаление migration_temp...")

        command = f'''
MYSQL_PWD="{config.mariadb.password}" mariadb \
-h {config.mariadb.host} \
-u {config.mariadb.user} \
-e "DROP DATABASE migration_temp;"
'''

        subprocess.run(command, shell=True, check=True)

    # ----------------------------------------------------

    def remove_temp(self):

        logger.info("Удаление full_dump.sql")

        if self.full_dump.exists():

            self.full_dump.unlink()

        logger.info("Временные файлы удалены.")