BEGIN;

ALTER TABLE migration_temp.payment_attempts
    ADD COLUMN IF NOT EXISTS purpose VARCHAR(32) NOT NULL DEFAULT 'order';

ALTER TABLE migration_temp.payment_attempts
    ALTER COLUMN order_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_payment_attempt_purpose'
          AND conrelid = 'migration_temp.payment_attempts'::regclass
    ) THEN
        ALTER TABLE migration_temp.payment_attempts
            ADD CONSTRAINT ck_payment_attempt_purpose CHECK (
                (purpose = 'order' AND order_id IS NOT NULL)
                OR (purpose = 'balance_topup' AND order_id IS NULL)
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_payment_attempt_purpose
    ON migration_temp.payment_attempts (purpose, user_id, created_at DESC);

COMMIT;
