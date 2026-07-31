# db_converter

## Логика

Так как проект будeт мигрировать из MariaDB в PostgreeSQL для него нужно написать отдельный модуль для конвертации базы данных в PostgreSQL. На вход будет подаваться дамп MariaDB, сначала базы импортируется в настоящую MariaDB, после чего с помощью `pgloader` переносит структуру и данные в PostgreSQL и схораняет данные внутри папки `backend/`.

У дамп файлов изначлаьно расширение `.sql` под `MariaDB`

## 1. Архитектура

```
db_converter/
  │
  ├── dumps/ ---------------------> Хранит дамп файлы для миграции
  │     ├── дамп_файл_1.sql
  │     ├── дамп_файл_2.sql
  │     └── дамп_файл_3.sql
  │
  ├── config/ ---------------------> Хранит конфигурации программы
  │     └── config.yaml
  │
  ├── logs/ -----------------------> Хранит логи
  │     ├── error.log
  │     └── info.log
  │
  ├── converter/ ------------------> Основная папка кода конвертёра
  │     ├── __init__.pyr
  │     ├── config.py
  │     ├── maria.py
  │     ├── postgres.py
  │     ├── pgloader.py
  │     ├── validator.py
  │     ├── models.py
  │     ├── exceptions.py
  │     ├── logger.py
  │     └── utils.py
  │
  └── main.py ---------------------> Файл запуска
```
Физические файлы активной PostgreSQL-базы будут находиться в локальном каталоге PostgreSQL.


## 1. Проверка данных

Для каждой таблицы будет сравниваться:

```
MariaDB: количество строк
PostgreSQL: количество строк
```

Также будет сравниваться общее количество таблиц.

Результат проверки будет храниться примерно так:

```python
{
    "database": "forum",
    "mariadb_tables": 24,
    "postgres_tables": 24,
    "mariadb_rows": 154230,
    "postgres_rows": 154230,
    "status": "success",
}
```

## Команды запуска

Обычная конвертация:

```bash
python main.py
```

Перезапись существующих PostgreSQL-баз:

```bash
python main.py --force
```

Перезапись с предварительным резервным копированием:

```bash
python main.py --force --backup
```

Обработка конкретного файла:

```bash
python main.py --file forum.sql
```

Проверка установленных программ и подключения:

```bash
python main.py --check
```

Расширенная отладочная информация:

```bash
python main.py --verbose
```

## Безопасное поведение

Без `--force` существующая PostgreSQL-база не удаляется:

```text
База forum уже существует.
Используйте --force для перезаписи.
```

С параметрами:

```bash
python main.py --force --backup
```

сначала будет выполнено:

```bash
pg_dump -Fc forum -f backups/forum_2026-07-31_14-46-00.dump
```

И только после успешного резервного копирования существующая база будет удалена.

## Поведение при ошибке

Ошибка одного дампа не должна останавливать обработку остальных файлов.

Например:

```text
users.sql       ✓ OK
forum.sql       ✗ Ошибка импорта MariaDB
orders.sql      ✓ OK
products.sql    ✗ Проверка строк не пройдена
messages.sql    ✓ OK
```

Подробная причина попадёт в:

```text
logs/converter.log
```

Временная MariaDB будет удаляться через `finally`, даже если `pgloader` или проверка завершились с ошибкой.

## Конфигурация

Пример расширенного `config/config.yaml`:

```yaml
mariadb:
  host: localhost
  port: 3306
  user: migrate
  password: migrate123
  charset: utf8mb4
  temporary_suffix: "_temp"

postgres:
  host: localhost
  port: 5432
  user: king
  password: king123
  maintenance_database: postgres

paths:
  dumps: ./dumps
  logs: ./logs
  temp: ./temp
  backups: ./backups

executables:
  mariadb: mariadb
  pgloader: pgloader
  pg_dump: pg_dump
  dropdb: dropdb
  createdb: createdb

conversion:
  continue_on_error: true
  validate_rows: true
  validate_tables: true
  create_backup: true
  command_timeout_seconds: 7200
  dump_encoding: utf-8

logging:
  level: INFO
  max_file_size_mb: 20
  backup_count: 10
```

Пароли желательно также разрешить передавать через переменные окружения:

```bash
export DB_CONVERTER_MARIADB_PASSWORD="migrate123"
export DB_CONVERTER_POSTGRES_PASSWORD="king123"
```

Переменные окружения должны иметь приоритет над `config.yaml`.

## Этапы разработки

1. Конфигурация, логирование и аргументы командной строки.
2. Управление локальной MariaDB.
3. Управление локальной PostgreSQL.
4. Запуск и контроль `pgloader`.
5. Проверка таблиц и количества строк.
6. Резервное копирование через `pg_dump`.
7. Прогресс, цвета и итоговый отчёт.
8. Обработка нестандартных кодировок и больших дампов.
9. README с установкой MariaDB, PostgreSQL и `pgloader`.
10. Тестирование на нескольких дампах.

Это ТЗ подходит для полноценной первой версии конвертера. Код следует писать так, чтобы импорт больших SQL-файлов выполнялся через системные процессы и потоковое чтение, без загрузки дампа целиком в оперативную память.