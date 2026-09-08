BEGIN;

ALTER TABLE migration_temp.users
    ALTER COLUMN login DROP NOT NULL,
    ALTER COLUMN mail DROP NOT NULL,
    ALTER COLUMN password DROP NOT NULL,
    ALTER COLUMN password TYPE TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_ci
    ON migration_temp.users (LOWER(login));

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_mail_ci
    ON migration_temp.users (LOWER(mail));

CREATE TABLE IF NOT EXISTS public.user_social_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_user_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_social_accounts_provider_provider_user_id_key
        UNIQUE (provider, provider_user_id),
    CONSTRAINT user_social_accounts_user_id_provider_key
        UNIQUE (user_id, provider)
);

ALTER TABLE public.user_social_accounts
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_user_social_accounts_user'
          AND conrelid = 'public.user_social_accounts'::regclass
    ) THEN
        ALTER TABLE public.user_social_accounts
            ADD CONSTRAINT fk_user_social_accounts_user
            FOREIGN KEY (user_id) REFERENCES migration_temp.users(id)
            ON DELETE CASCADE NOT VALID;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_user_social_accounts_provider'
          AND conrelid = 'public.user_social_accounts'::regclass
    ) THEN
        ALTER TABLE public.user_social_accounts
            ADD CONSTRAINT ck_user_social_accounts_provider
            CHECK (provider IN ('telegram', 'vk')) NOT VALID;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.vk_auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    state_hash CHAR(64) NOT NULL UNIQUE,
    code_verifier TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.telegram_auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    token_hash CHAR(64) NOT NULL UNIQUE,
    telegram_id BIGINT,
    telegram_username TEXT,
    telegram_display_name TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.telegram_auth_sessions
    ALTER COLUMN user_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS telegram_display_name TEXT,
    ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_telegram_auth_sessions_user'
          AND conrelid = 'public.telegram_auth_sessions'::regclass
    ) THEN
        ALTER TABLE public.telegram_auth_sessions
            ADD CONSTRAINT fk_telegram_auth_sessions_user
            FOREIGN KEY (user_id) REFERENCES migration_temp.users(id)
            ON DELETE CASCADE NOT VALID;
    END IF;
END
$$;

COMMIT;

ALTER TABLE public.user_social_accounts
    VALIDATE CONSTRAINT fk_user_social_accounts_user;

ALTER TABLE public.user_social_accounts
    VALIDATE CONSTRAINT ck_user_social_accounts_provider;

ALTER TABLE public.telegram_auth_sessions
    VALIDATE CONSTRAINT fk_telegram_auth_sessions_user;
