BEGIN;

-- Время истечения счёта у провайдера (для таймера оплаты на фронте).
-- NULL — не задано (например, до повторного создания инвойса).
ALTER TABLE migration_temp.payment_attempts
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMIT;
