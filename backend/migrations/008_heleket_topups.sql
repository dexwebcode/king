BEGIN;

-- Heleket: локальный order_id инвойса (генерируется backend'ом), UUID инвойса
-- хранится в существующем provider_payment_id, сумма — в amount (RUB).
ALTER TABLE migration_temp.payment_attempts
    ADD COLUMN IF NOT EXISTS provider_order_id TEXT;

-- Идемпотентность: у провайдера один локальный order_id на попытку.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempt_heleket_order_id
    ON migration_temp.payment_attempts (provider_order_id)
    WHERE provider = 'heleket'
      AND provider_order_id IS NOT NULL
      AND provider_order_id <> '';

-- Дополнительная защита от двойного зачисления: одно движение баланса
-- на один инвойс Heleket.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_heleket_external_id
    ON migration_temp."transaction" (method, "transaction")
    WHERE method = 'heleket'
      AND "transaction" IS NOT NULL
      AND "transaction" <> '';

COMMIT;
