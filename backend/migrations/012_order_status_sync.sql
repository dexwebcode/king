BEGIN;

-- Время последней сверки статуса заказа с поставщиком.
-- Используется фоновым worker'ом, чтобы синхронизировать активные заказы
-- ограниченными батчами, а не гонять supplier-запросы при каждом открытии списка.
ALTER TABLE migration_temp.orders
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMIT;
