#!/usr/bin/env bash
# Ночной дамп базы в /opt/doorsmarket/dump (pg_dump -Fc), храним последние KEEP_DAYS дней.
# Восстановление: pg_restore --clean --if-exists -d <база> dump/doorsmarket-YYYYMMDD-HHMM.dump
# Запуск из cron (см. crontab на сервере): scripts/dump_db.sh >> /var/log/doorsmarket/dump.log 2>&1
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_DIR="$APP_DIR/dump"
KEEP_DAYS="${KEEP_DAYS:-30}"

# Креды из .env (`. ./.env` не подходит — там есть строки не в формате shell)
eval "$(grep -E '^DATABASE_(NAME|USER|PASSWORD|HOST|PORT)=' "$APP_DIR/.env" | sed 's/^/export /')"

mkdir -p "$DUMP_DIR"
file="$DUMP_DIR/doorsmarket-$(date +%Y%m%d-%H%M).dump"
PGPASSWORD="$DATABASE_PASSWORD" pg_dump -Fc \
    -h "${DATABASE_HOST:-localhost}" -p "${DATABASE_PORT:-5432}" \
    -U "$DATABASE_USER" "$DATABASE_NAME" -f "$file.tmp"
mv "$file.tmp" "$file"

find "$DUMP_DIR" -name 'doorsmarket-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') дамп готов: $file ($(du -h "$file" | cut -f1))"
