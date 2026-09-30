BEGIN;

-- =====================================================================
-- 016_admin_panel.sql — инфраструктура административной панели.
--
-- Новые данные (существующие строки не изменяются и не удаляются):
--   * users.created_at / last_seen_at / ban_reason / banned_by / banned_at;
--   * reviews.deleted_at / deleted_by (мягкое удаление отзывов);
--   * app_settings       — централизованные настройки (глобальная наценка и пр.);
--   * traffic_events     — минимальная внутренняя аналитика посещений;
--   * admin_audit_log    — журнал действий администраторов.
-- =====================================================================

-- 1. Пользователи: дата регистрации, последняя активность, бан.
ALTER TABLE migration_temp.users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ban_reason TEXT,
    ADD COLUMN IF NOT EXISTS banned_by BIGINT,
    ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Приблизительная дата регистрации legacy-аккаунтов: первый заказ.
-- NULL остаётся только у пользователей без заказов; статистика «новых
-- пользователей» учитывает только заполненные created_at.
UPDATE migration_temp.users AS u
SET created_at = s.first_seen
FROM (
    SELECT o.user_id,
           MIN(TO_TIMESTAMP(o.date, 'HH24:MI:SS DD.MM.YYYY')) AS first_seen
    FROM migration_temp.orders AS o
    GROUP BY o.user_id
) AS s
WHERE u.id = s.user_id
  AND u.created_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_users_created_at
    ON migration_temp.users (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_users_last_seen
    ON migration_temp.users (last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_users_banned
    ON migration_temp.users (banned, id);

-- 2. Отзывы: мягкое удаление.
ALTER TABLE migration_temp.reviews
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by BIGINT;
CREATE INDEX IF NOT EXISTS ix_reviews_deleted
    ON migration_temp.reviews (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Централизованные настройки приложения (глобальная наценка, окно
--    активности пользователей и т.п.). Одно значение на весь проект.
CREATE TABLE IF NOT EXISTS migration_temp.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by BIGINT
);

-- 4. События посещений (внутренняя аналитика).
--    visitor_hash — HMAC от клиентского анонимного ID: персональные данные
--    не хранятся. user_id заполняется только для авторизованных посетителей.
CREATE TABLE IF NOT EXISTS migration_temp.traffic_events (
    id BIGSERIAL PRIMARY KEY,
    visitor_hash TEXT NOT NULL,
    user_id BIGINT,
    event_type VARCHAR(32) NOT NULL DEFAULT 'pageview',
    path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_traffic_created
    ON migration_temp.traffic_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_traffic_visitor
    ON migration_temp.traffic_events (visitor_hash);
CREATE INDEX IF NOT EXISTS ix_traffic_user
    ON migration_temp.traffic_events (user_id) WHERE user_id IS NOT NULL;

-- 5. Журнал действий администраторов. Без паролей, токенов и API-ключей.
CREATE TABLE IF NOT EXISTS migration_temp.admin_audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    action VARCHAR(64) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_created
    ON migration_temp.admin_audit_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_audit_admin
    ON migration_temp.admin_audit_log (admin_id, created_at DESC);

-- 6. Индексы для статистических запросов (по реальным условиям выборок).
CREATE INDEX IF NOT EXISTS ix_orders_status
    ON migration_temp.orders (status, id DESC);
CREATE INDEX IF NOT EXISTS ix_payment_attempts_processed
    ON migration_temp.payment_attempts (processed_at)
    WHERE processed_at IS NOT NULL;

COMMIT;
