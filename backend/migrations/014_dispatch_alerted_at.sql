BEGIN;

-- Отметка, что администратор уже уведомлён о зависшей отправке заказа
-- (sending/unknown). Используется фоновым алертом, чтобы не спамить.
ALTER TABLE migration_temp.orders
    ADD COLUMN IF NOT EXISTS dispatch_alerted_at TIMESTAMPTZ;

COMMIT;
