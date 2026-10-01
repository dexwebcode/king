BEGIN;

-- =====================================================================
-- 017_analytics_auth_events.sql — учёт входов и регистраций.
--
-- События входа/регистрации пишет САМ backend в момент успешной операции
-- (клиенту доверять нельзя), поэтому у них нет анонимного visitor-хеша.
-- Существующие события просмотров (pageview) не изменяются.
-- =====================================================================

ALTER TABLE migration_temp.traffic_events
    ALTER COLUMN visitor_hash DROP NOT NULL;

-- Разрез по типу события (просмотры / входы / регистрации).
CREATE INDEX IF NOT EXISTS ix_traffic_type_created
    ON migration_temp.traffic_events (event_type, created_at DESC, id DESC);

-- Разрез по страницам (в первую очередь — главная страница).
CREATE INDEX IF NOT EXISTS ix_traffic_path_created
    ON migration_temp.traffic_events (path, created_at DESC)
    WHERE event_type = 'pageview';

COMMIT;
