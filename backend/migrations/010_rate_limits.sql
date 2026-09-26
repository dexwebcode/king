BEGIN;

-- Общий для всех worker счётчик частоты запросов (rate limit).
-- Фиксированное окно (window_start в секундах эпохи), атомарный upsert.
CREATE TABLE IF NOT EXISTS migration_temp.rate_limit_entries (
    key TEXT NOT NULL,
    window_start BIGINT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

COMMIT;
