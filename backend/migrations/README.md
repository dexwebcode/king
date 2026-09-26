# Миграции KingPromotion

Миграции применяются строго по порядку (числовой префикс). `000_baseline.sql`
создаёт legacy-таблицы, на которые опираются все последующие файлы.

## Порядок

| Файл | Что делает |
|---|---|
| `000_baseline.sql` | Baseline legacy-схема: `users`, `orders`, `transaction`, `expenses`, `referals`, enum `users_lang`, последовательности, PK/FK/индексы. |
| `001_yookassa_balance.sql` | `payment_attempts`, уникальные индексы, FK `orders.user_id`, частичные индексы external ID. |
| `002_passwordless_social_auth.sql` | nullable login/mail/password, `password TEXT`, social-аккаунты, auth-сессии. |
| `003_reviews.sql` | Отзывы. |
| `004_balance_topups.sql` | `payment_attempts.purpose` (пополнения баланса). |
| `005_crystalpay_topups.sql` | CrystalPAY-поля пополнений. |
| `006_support_tickets.sql` | Тикеты поддержки. |
| `007_account_connections.sql` | Подключения аккаунта. |
| `008_heleket_topups.sql` | Heleket-поля пополнений. |
| `009_supplier_cost_snapshot.sql` | `orders.supplier_cost` (снимок себестоимости). |
| `010_rate_limits.sql` | `rate_limit_entries` (rate limiting). |
| `011_token_version.sql` | `users.token_version` (отзыв JWT). |

## Применение

Нужен `psql` (PostgreSQL 16) и `DATABASE_URL` в окружении.

```bash
# весь набор по порядку (в т.ч. baseline)
DATABASE_URL=postgresql://user:pass@localhost:5432/king ./apply.sh

# или вручную
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 000_baseline.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 001_yookassa_balance.sql
# ... и далее по порядку
```

Для **новой (пустой) базы** применяется весь набор: сначала `000`, затем `001`–`011`.
Для **существующей базы**, где legacy-таблицы уже есть, `000_baseline.sql` НЕ нужен —
применяются только ещё не накаченные файлы (например, `009`–`011`), но `000`
идемпотентен по факту существующих объектов (`CREATE SCHEMA/SEQUENCE`, `DO $$ IF NOT EXISTS`).

> `001`–`008` содержат идемпотентные конструкции (`IF NOT EXISTS`, `DO $$`), но
> в общем случае миграции не рассчитаны на повторное применение на БД, где они
> уже частично применялись с изменениями. Ведите версию схемы через этот каталог
> и применяйте каждый файл ровно один раз.

## Верификация baseline (снято из рабочей БД, 2026-09-26)

`000_baseline.sql` получен командой `pg_dump --schema-only --no-owner --no-privileges`
для таблиц `migration_temp.users/orders/transaction/expenses/referals`, затем
дополнен `CREATE SCHEMA` и `CREATE TYPE users_lang`. Smoke-тест: применяется к
чистой схеме, создаёт 5 таблиц, enum `{ru,en}` и FK `fk_orders_user`.

### Типы денежных полей

| Таблица.колонка | Тип | Nullable | Default |
|---|---|---|---|
| `users.balance` | `numeric(10,2)` | NO | `0.00` |
| `orders.amount` | `numeric(10,2)` | NO | — |
| `transaction.amount` | `numeric(10,2)` | NO | — |
| `transaction.balance` | `numeric(10,2)` | NO | — |
| `expenses.amount` | `numeric(10,2)` | YES | — |
| `expenses.balance_before/after` | `numeric(10,2)` | YES | — |
| `referals.amount` | `numeric(10,2)` | NO | `0.00` |

Все денежные поля — `numeric(10,2)` (не `money`, не `float`). `CHECK amount > 0`
есть только на `payment_attempts.amount` (см. `001`); у legacy-таблиц таких
проверок нет — инвариант неотрицательности обеспечивается приложением
(`Decimal` + блокировки), а не БД.

### Внешние ключи legacy-таблиц

- `orders.user_id -> users.id` (`fk_orders_user`, `ON DELETE RESTRICT`) — единственный FK.
- `expenses.user_id` и `transaction.user_id` — `character varying` **без** FK (legacy строковые ID).
- `referals.user_id` — `bigint` **без** FK.

### Прочие замечания

- `users.lang` — enum `migration_temp.users_lang {ru,en}`.
- `orders.soc` — `varchar(9)`, `orders.status` — `varchar(29)`, `orders.link` — `varchar(999)`.
- `users.token`, `users.chat_id`, `users.telegram` — legacy поля, в коде не используются.
