# Конвертирование из MariaDB -> PostgreSQL

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
sudo systemctl status mariadb
Должно быть:`active (running)`
