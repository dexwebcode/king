BEGIN;

CREATE TABLE IF NOT EXISTS migration_temp.payment_attempts (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(30) NOT NULL DEFAULT 'yookassa',
    provider_payment_id VARCHAR(99),
    idempotence_key UUID NOT NULL,
    user_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    transaction_id BIGINT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    status VARCHAR(32) NOT NULL DEFAULT 'creating',
    confirmation_url TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    dispatch_status VARCHAR(32) NOT NULL DEFAULT 'not_started',
    dispatch_started_at TIMESTAMPTZ,
    dispatch_finished_at TIMESTAMPTZ,
    dispatch_error TEXT,

    CONSTRAINT uq_payment_attempt_provider_key
        UNIQUE (provider, idempotence_key),
    CONSTRAINT uq_payment_attempt_provider_payment
        UNIQUE (provider, provider_payment_id),
    CONSTRAINT uq_payment_attempt_transaction
        UNIQUE (transaction_id),
    CONSTRAINT uq_payment_attempt_order
        UNIQUE (order_id),
    CONSTRAINT fk_payment_attempt_user
        FOREIGN KEY (user_id)
        REFERENCES migration_temp.users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_payment_attempt_order
        FOREIGN KEY (order_id)
        REFERENCES migration_temp.orders(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_payment_attempt_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES migration_temp."transaction"(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_payment_attempt_user
    ON migration_temp.payment_attempts (user_id);

ALTER TABLE migration_temp.payment_attempts
    ALTER COLUMN order_id SET NOT NULL;

DROP INDEX IF EXISTS migration_temp.ix_payment_attempt_order;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempt_order
    ON migration_temp.payment_attempts (order_id);

CREATE INDEX IF NOT EXISTS ix_payment_attempt_status
    ON migration_temp.payment_attempts (status);

DROP INDEX IF EXISTS migration_temp.uq_transaction_method_external_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_yookassa_external_id
    ON migration_temp."transaction" (method, "transaction")
    WHERE method = 'yookassa'
      AND "transaction" IS NOT NULL
      AND "transaction" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_id_rocket
    ON migration_temp.orders (id_rocket)
    WHERE id_rocket <> 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_ci
    ON migration_temp.users (LOWER(login));

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_mail_ci
    ON migration_temp.users (LOWER(mail));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_orders_user'
          AND conrelid = 'migration_temp.orders'::regclass
    ) THEN
        ALTER TABLE migration_temp.orders
            ADD CONSTRAINT fk_orders_user
            FOREIGN KEY (user_id)
            REFERENCES migration_temp.users(id)
            ON DELETE RESTRICT
            NOT VALID;
    END IF;
END
$$;

COMMIT;

ALTER TABLE migration_temp.orders
    VALIDATE CONSTRAINT fk_orders_user;
