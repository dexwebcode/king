BEGIN;

ALTER TABLE migration_temp.payment_attempts
    ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(10, 2);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_payment_attempt_credited_amount'
          AND conrelid = 'migration_temp.payment_attempts'::regclass
    ) THEN
        ALTER TABLE migration_temp.payment_attempts
            ADD CONSTRAINT ck_payment_attempt_credited_amount
            CHECK (credited_amount IS NULL OR credited_amount > 0);
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_crystalpay_external_id
    ON migration_temp."transaction" (method, "transaction")
    WHERE method = 'crystalpay'
      AND "transaction" IS NOT NULL
      AND "transaction" <> '';

COMMIT;
