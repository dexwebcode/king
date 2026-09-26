BEGIN;

-- Версия токена пользователя: при выходе и смене пароля инкрементируется,
-- из-за чего все ранее выпущенные JWT перестают действовать.
ALTER TABLE migration_temp.users
    ADD COLUMN IF NOT EXISTS token_version BIGINT NOT NULL DEFAULT 0;

COMMIT;
