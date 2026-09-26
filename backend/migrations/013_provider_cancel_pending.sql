BEGIN;

-- Флаг «отмена у провайдера не выполнена». Когда локальная отмена прошла, но
-- cancel у ЮKassa упал (сеть/500), выставляется NOW(); фоновый worker повторяет
-- отмену, а при успехе очищает поле.
ALTER TABLE migration_temp.payment_attempts
    ADD COLUMN IF NOT EXISTS provider_cancel_pending_at TIMESTAMPTZ;

COMMIT;
