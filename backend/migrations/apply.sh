#!/usr/bin/env bash
# Migration runner для KingPromotion.
#
# Применяет ТОЛЬКО ещё не применённые SQL-миграции по порядку числового
# префикса. Журнал применённых — таблица public.schema_migrations.
#
# Использование:
#   DATABASE_URL=postgresql://user:pass@host/db ./apply.sh           # применить недостающие
#   DATABASE_URL=postgresql://user:pass@host/db ./apply.sh --mark-all # bootstrap: пометить все файлы применёнными (для существующей БД)
#
# Требует psql в PATH. DATABASE_URL может быть в формате postgresql:// или
# postgresql+psycopg://.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL не задан}"

cd "$(dirname "$0")"
PG_URL="${DATABASE_URL/+psycopg/}"

# 1. Журнал применённых миграций.
psql "$PG_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(20) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# 2. Bootstrap: пометить все существующие файлы как применённые, не выполняя их.
#    Нужен один раз на уже работающей БД, где миграции накатывались вручную.
if [ "${1:-}" = "--mark-all" ]; then
    for file in $(find . -maxdepth 1 -name '*.sql' | sort); do
        name="$(basename "$file")"
        version="${name%%_*}"
        psql "$PG_URL" -v ON_ERROR_STOP=1 -q \
            -c "INSERT INTO schema_migrations (version, filename) VALUES ('$version', '$name') ON CONFLICT (version) DO NOTHING"
        echo "marked $name"
    done
    echo "Готово. Все существующие миграции помечены как применённые."
    exit 0
fi

# 3. Список уже применённых версий.
applied="$(psql "$PG_URL" -tA -c 'SELECT version FROM schema_migrations' 2>/dev/null || true)"

# 4. Применить недостающие по порядку.
for file in $(find . -maxdepth 1 -name '*.sql' | sort); do
    name="$(basename "$file")"
    version="${name%%_*}"
    if printf '%s\n' "$applied" | grep -qx "$version"; then
        echo "skip  $name"
        continue
    fi
    echo "apply $name"
    psql "$PG_URL" -v ON_ERROR_STOP=1 -q -f "$file"
    psql "$PG_URL" -v ON_ERROR_STOP=1 -q \
        -c "INSERT INTO schema_migrations (version, filename) VALUES ('$version', '$name')"
    echo "ok    $name"
done

echo "Готово."
