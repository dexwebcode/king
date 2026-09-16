BEGIN;

CREATE TABLE IF NOT EXISTS migration_temp.reviews (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text TEXT NOT NULL CHECK (char_length(btrim(text)) BETWEEN 10 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reviews_user UNIQUE (user_id),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id)
        REFERENCES migration_temp.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_reviews_created ON migration_temp.reviews (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_reviews_rating ON migration_temp.reviews (rating DESC, id DESC);

COMMIT;
