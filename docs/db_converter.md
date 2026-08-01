# Конвертирование из MariaDB в PostgreSQL

Данная документация пишеться для Ubuntu Linux Если у вас установлена другая версия линукс адаптируйте консольные команды под ваш дистрибутив.

## Шаг 1. Обновляем систему

 `sudo apt update`


## ШАГ 2. Устанавливаем MariaDB
`sudo apt install mariadb-server mariadb-client -y`

## ШАГ 3. Проверяем MariaDB
`mariadb --version`

Должно быть примерно: `mariadb  Ver 15.1 Distrib 10.11.x`

## ШАГ 4. Запускаем MariaDB
`sudo systemctl start mariadb`


## ШАГ 5. Проверяем статус
`sudo systemctl status mariadb`

Должно быть:`active (running)`

## ШАГ 6. Войти в MariaDB под root
`sudo mariadb`

Если всё хорошо, увидишь: `MariaDB [(none)]>`

## ШАГ 7. Посмотреть существующих пользователей
Внутри MariaDB выполни: `SELECT User, Host FROM mysql.user;`

## ШАГ 8. Удалить старого пользователя (если есть)
`DROP USER IF EXISTS 'converter'@'localhost';`

## ШАГ 9. Создать нового пользователя
``CREATE USER 'converter'@'localhost'
IDENTIFIED BY 'converter123';``

## ШАГ 10. Выдать все права
``GRANT ALL PRIVILEGES
ON *.*
TO 'converter'@'localhost'
WITH GRANT OPTION;``

## ШАГ 11. Применить изменения
`FLUSH PRIVILEGES;`

## ШАГ 12. Проверить права
`SHOW GRANTS FOR 'converter'@'localhost';`

Должно быть что-то вроде:

`GRANT ALL PRIVILEGES ON *.* TO `converter`@`localhost` WITH GRANT OPTION`

## ШАГ 13. Выйти
EXIT;

## ШАГ 14. Проверить вход новым пользователем
`MYSQL_PWD="converter123" mariadb -u converter`

Если всё сделано правильно, откроется:

`MariaDB [(none)]>`


## ШАГ 15. Установить PostgreSQL
`sudo apt install postgresql postgresql-client -y`

## ШАГ 16. Запустить PostgreSQL
`sudo systemctl start postgresql`

## ШАГ 17. Проверить статус
`sudo systemctl status postgresql`

Должно быть: `active (running)`

## ШАГ 18. Установить pgloader
`sudo apt install pgloader -y`

## ШАГ 19. Проверить pgloader
`pgloader --version`

Если покахывает версию, то всё хорошо

## ШАГ 20. Зайти в PostgreSQL
`sudo -u postgres psql`

## ШАГ 21. Удалить пользователя (если существует)
`DROP ROLE IF EXISTS king;`

## ШАГ 22. Создать пользователя
```
CREATE ROLE king
LOGIN
PASSWORD 'king123';
```

## ШАГ 23. Выдать все права

```
ALTER ROLE king
SUPERUSER
CREATEDB
CREATEROLE
REPLICATION
BYPASSRLS;
```

## ШАГ 24. Проверить права
`\du`

Должно быть примерно:

```
 Role name |                         Attributes
-----------+----------------------------------------------------
 king      | Superuser, Create role, Create DB, Replication
 postgres  | Superuser, Create role, Create DB
```

## ШАГ 25. Выйти
`\q`

## ШАГ 26. Проверить вход пользователем king
`PGPASSWORD="king123" psql -h localhost -U king -d postgres`

Если всё хорошо, увидишь:

`postgres=>`

## ШАГ 27. Выйти
`\q`

После этого у тебя будет
MariaDB
user = converter
password = converter123
PostgreSQL
user = king
password = king123

## ШАГ 28. Создать временную MariaDB
```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
-e "
DROP DATABASE IF EXISTS migration_temp;

CREATE DATABASE migration_temp
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
"
```

## ШАГ 29. Создать PostgreSQL
`dropdb --if-exists -U king kingpromotion`

## ШАГ 30.
`createdb -U king kingpromotion`

## ШАГ 31. Импортировать users.sql
`cd /king/backend`
После

```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < dumps/users.sql
```

## ШАГ 32. Перенести в PostgreSQL
```
pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion
```

## ШАГ 33. Импортировать orders.sql

```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < dumps/orders.sql
```

## ШАГ 34.
```
pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion
```

## ШАГ 35. Импортировать referrals.sql
```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < dumps/referrals.sql
```

## ШАГ 36.
```
pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion
```

## ШАГ 37. Импортировать transaction.sql
```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < dumps/transaction.sql
```

⸻

## ШАГ 38.
```
pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion
```

## ШАГ 39. Импортировать expenses.sql
```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < dumps/expenses.sql
```

## ШАГ 40.
```
pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion
```

## ШАГ 41. Проверить PostgreSQL
`psql -U king -d kingpromotion`

⸻

## ШАГ 42.
`\dt`

Ты увидишь все таблицы:
```
users
orders
expenses
transaction
referrals
...
```

## ШАГ 43.
`SELECT COUNT(*) FROM users;`

## ШАГ 44.
`\q`

## ШАГ 45. Удалить временную MariaDB

```
MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
-e "DROP DATABASE migration_temp;"
```


❗ Но я бы изменил ещё одну вещь в алгоритме
Есть важный нюанс.
Если ты просто сделаешь:
users.sql
↓

orders.sql
↓

orders.sql
в одну и ту же временную базу migration_temp, то таблицы из предыдущего дампа останутся. Если следующий дамп содержит команды CREATE TABLE, они могут завершиться ошибкой “Table already exists”.
Поэтому перед импортом каждого следующего .sql лучше заново создавать временную базу:
users.sql
↓

migration_temp

↓

pgloader

↓

DROP migration_temp

↓

CREATE migration_temp

↓

orders.sql

↓

pgloader

↓

DROP migration_temp

↓

CREATE migration_temp

↓

...
Так каждый дамп импортируется в “чистую” MariaDB, а в PostgreSQL постепенно собирается итоговая база kingpromotion. Это более надёжный и предсказуемый процесс, особенно если дампы содержат команды создания таблиц.
