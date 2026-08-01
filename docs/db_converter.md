ВО! 🔥 Теперь можно сказать, что мы нашли правильную архитектуру.

По скриншоту видно:

* ✅ CREATE DATABASE нет.
* ✅ USE нет.
* ✅ DROP DATABASE нет.
* ✅ Все таблицы лежат в одной базе kingpromotion.
* ✅ После объединения получился полностью валидный SQL.

Это идеальный сценарий.

⸻

Теперь следующий этап

Давай проверим, что весь этот full_dump.sql импортируется в MariaDB.

Шаг 9

Создай чистую базу:

MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
-e "
DROP DATABASE IF EXISTS migration_temp;
CREATE DATABASE migration_temp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
"

⸻

Шаг 10

Импортируй весь дамп:

MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp < temp/full_dump.sql

Если команда закончилась без ошибок — это очень хороший знак.

⸻

Шаг 11

Проверим таблицы:

MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp \
-e "SHOW TABLES;"

Должно появиться примерно:

expenses
orders
referals
transaction
users

⸻

Шаг 12

Проверим количество строк:

MYSQL_PWD="converter123" mariadb \
-h localhost \
-u converter \
migration_temp \
-e "SELECT COUNT(*) FROM users;"

⸻

Шаг 13

Теперь создаём PostgreSQL:

PGPASSWORD="king123" psql \
-h localhost \
-U king \
-d postgres \
-c "DROP DATABASE IF EXISTS kingpromotion;"

Затем:

PGPASSWORD="king123" psql \
-h localhost \
-U king \
-d postgres \
-c "CREATE DATABASE kingpromotion;"

⸻

Шаг 14

Запускаем ОДИН pgloader:

pgloader \
mysql://converter:converter123@localhost/migration_temp \
postgresql://king:king123@localhost/kingpromotion

⸻

Если всё пройдёт успешно…

То мы можем выбросить из проекта примерно половину кода.

Вместо сложной логики:

for sql_file in dumps:
    create_temp_db()
    import_sql()
    pgloader()
    drop_temp_db()

останется:

merge_sql_files()
↓
create_temp_db()
↓
import_full_dump()
↓
pgloader()
↓
validate()
↓
drop_temp_db()

Это намного проще, быстрее и надёжнее.

Мне очень нравится, к чему мы пришли

Честно говоря, первоначальное ТЗ было хорошим, но теперь архитектура стала сильнее:

* один импорт в MariaDB;
* один запуск pgloader;
* одна итоговая база kingpromotion;
* меньше кода;
* меньше точек отказа;
* проще поддерживать.

Именно такую схему я бы уже реализовывал в Python.

ДААА! 🔥🔥🔥

Это именно тот результат, которого мы хотели добиться.

Самое главное, что видно на скриншоте:

Create Tables        0 errors
migration_temp.users
147 rows
migration_temp.orders
505 rows
migration_temp.expenses
656 rows
migration_temp.transaction
76 rows
migration_temp.referals
118 rows
Total import time
1.636s

И самое важное:

errors = 0

Это означает

✅ MariaDB полностью рабочая

✅ PostgreSQL полностью рабочий

✅ pgloader полностью рабочий

✅ Конвертация работает

✅ Все пять таблиц перенеслись

⸻

Теперь самое крутое

Честно говоря…

Конвертер уже готов примерно на 80%.

Осталось написать Python, который вместо тебя будет выполнять буквально эти команды.

То есть Python должен сделать:

merge_sql()
↓
create_temp_database()
↓
import_dump()
↓
create_postgres()
↓
run_pgloader()
↓
validate()
↓
drop_temp_database()
↓
delete_full_dump()

И всё.

⸻

Но я бы сейчас сделал ещё одну вещь

Это последняя ручная проверка.

Давай убедимся, что PostgreSQL действительно содержит все данные.

Выполни:

PGPASSWORD="king123" psql \
-h localhost \
-U king \
-d kingpromotion

Потом внутри PostgreSQL:

\dt

Потом:

SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM expenses;
SELECT COUNT(*) FROM transaction;
SELECT COUNT(*) FROM referals;

(обрати внимание на название таблицы: у тебя на скриншоте она называется referals, с одной r после e, а не referrals — используй именно то имя, которое покажет \dt).

Если числа совпадут с тем, что перенёс pgloader, значит цепочка полностью проверена.

⸻

И знаешь, что меня радует больше всего?

Ты сейчас собрал рабочую схему миграции, а не просто написал код.

Теперь можно спокойно писать Python, потому что каждая команда уже проверена вручную. Это именно тот подход, который используют при разработке серьёзных утилит миграции: сначала убедиться, что весь процесс работает руками, а потом автоматизировать его. Это сильно уменьшает количество ошибок и упрощает отладку.