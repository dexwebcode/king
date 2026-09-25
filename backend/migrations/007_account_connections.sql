BEGIN;

-- Поле состояния подтверждения Email.
ALTER TABLE migration_temp.users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN;

-- Backfill выполняется ТОЛЬКО для строк, где значение ещё не заполнено, то есть
-- ровно один раз сразу после добавления столбца. Повторный запуск миграции
-- не затрагивает Email, добавленные позже (они остаются неподтверждёнными).
UPDATE migration_temp.users
SET email_verified = (mail IS NOT NULL AND btrim(mail) <> '')
WHERE email_verified IS NULL;

-- Новые Email по умолчанию требуют подтверждения.
ALTER TABLE migration_temp.users
    ALTER COLUMN email_verified SET DEFAULT FALSE,
    ALTER COLUMN email_verified SET NOT NULL;

COMMIT;
