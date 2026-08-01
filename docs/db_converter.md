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

Должно быть что-то вроде: ``GRANT ALL PRIVILEGES ON *.* TO `converter`@`localhost` WITH GRANT OPTION``

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

Должно быть:
`active (running)`

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
`CREATE ROLE king LOGIN;`

⸻

## ШАГ 23. Сделать его суперпользователем
`ALTER ROLE king
SUPERUSER
CREATEDB
CREATEROLE
REPLICATION
BYPASSRLS;`

## ШАГ 24. Проверить
`\du`

Ты увидишь примерно:
``Role name | Attributes
--------------------------------------------
king      | Superuser, Create role, Create DB
postgres  | Superuser
``

## ШАГ 25. Выйти
`\q`

## ШАГ 26. Создать пользователя Linux
`sudo adduser king`


Заполни пароль и остальные поля (или оставь поля пустыми, если система позволяет).

## ШАГ 27. Переключиться на него
`su - king`

⸻

## ШАГ 28. Проверить вход в PostgreSQL
`psql`


Если всё настроено правильно, откроется PostgreSQL без запроса пароля.
Что получится
У тебя будет:
    👤 Пользователь Linux: king
    🐘 Пользователь PostgreSQL: king
И благодаря аутентификации peer команды будут работать без указания пароля:
``psql
createdb forum
dropdb forum
pg_dump forum
``