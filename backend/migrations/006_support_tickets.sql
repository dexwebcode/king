BEGIN;

-- Красивый публичный номер обращения: SUP-000123.
-- Отдельная последовательность, не зависящая от внутреннего BIGSERIAL id,
-- чтобы публичный номер не раскрывал внутренний порядковый идентификатор.
CREATE SEQUENCE IF NOT EXISTS migration_temp.support_ticket_seq;

CREATE TABLE IF NOT EXISTS migration_temp.support_tickets (
    id BIGSERIAL PRIMARY KEY,
    public_id TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    contact TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    assigned_admin_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT uq_support_tickets_public_id UNIQUE (public_id),
    CONSTRAINT ck_support_tickets_status
        CHECK (status IN ('new', 'in_progress', 'answered', 'waiting_user', 'closed')),
    CONSTRAINT fk_support_tickets_user
        FOREIGN KEY (user_id) REFERENCES migration_temp.users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_tickets_admin
        FOREIGN KEY (assigned_admin_id) REFERENCES migration_temp.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_support_tickets_user
    ON migration_temp.support_tickets (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_support_tickets_status
    ON migration_temp.support_tickets (status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_support_tickets_created
    ON migration_temp.support_tickets (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS migration_temp.support_messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    sender_type VARCHAR(16) NOT NULL,
    sender_user_id BIGINT,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    telegram_message_id BIGINT,
    CONSTRAINT ck_support_messages_sender_type
        CHECK (sender_type IN ('user', 'admin', 'system')),
    CONSTRAINT ck_support_messages_content
        CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),
    CONSTRAINT fk_support_messages_ticket
        FOREIGN KEY (ticket_id) REFERENCES migration_temp.support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_support_messages_ticket
    ON migration_temp.support_messages (ticket_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS ix_support_messages_created
    ON migration_temp.support_messages (created_at);
-- Для функции "Reply" в Telegram: связываем telegram_message_id уведомления с тикетом.
CREATE INDEX IF NOT EXISTS ix_support_messages_telegram
    ON migration_temp.support_messages (telegram_message_id)
    WHERE telegram_message_id IS NOT NULL;

COMMIT;
