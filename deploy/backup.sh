#!/usr/bin/env bash
# Бэкап БД CMS и файлов медиатеки. Запускать по cron ежедневно, например:
#   17 3 * * * bash ~/cms-admin/deploy/backup.sh >> ~/crito-backup.log 2>&1
#
# Копии лежат на том же сервере: это защита от ошибок и неудачных миграций, но не от потери диска.
# Периодически забирайте каталог BACKUP_DIR на другую машину.
# SECRETS_KEY (site.env) бэкапьте отдельно: без него секреты вебхуков в дампе не расшифровать.
set -euo pipefail

BACKUP_DIR="${CRITO_BACKUP_DIR:-/var/backups/crito}"
KEEP_DAYS="${CRITO_BACKUP_KEEP_DAYS:-14}"
DATE="$(date +%F)"

# Нужны только DATABASE_URL и STORAGE_LOCAL_DIR из site.env (файл не исполняется как shell).
SITE_ENV="${CRITO_SITE_ENV:-${CRITO_ROOT:-$HOME/cms-admin}/site.env}"
env_value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$SITE_ENV" | tail -n 1 | tr -d '\r' | sed -E "s/^(['\"])(.*)\1\$/\2/"
}
DATABASE_URL="$(env_value DATABASE_URL)"
STORAGE_LOCAL_DIR="$(env_value STORAGE_LOCAL_DIR)"

mkdir -p "$BACKUP_DIR"
umask 077

# Дамп пишется во временный файл и переименовывается: оборванный бэкап не подменяет хороший.
# pg_dump не знает параметр Prisma `schema=`, но нужен `sslmode=` (Neon без SSL не пускает): убираем только schema.
PG_URL="$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"
pg_dump --format=custom --file "$BACKUP_DIR/crito-$DATE.dump.tmp" "$PG_URL"
mv "$BACKUP_DIR/crito-$DATE.dump.tmp" "$BACKUP_DIR/crito-$DATE.dump"

if [ -d "${STORAGE_LOCAL_DIR:-}" ]; then
  tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz.tmp" -C "$STORAGE_LOCAL_DIR" .
  mv "$BACKUP_DIR/uploads-$DATE.tar.gz.tmp" "$BACKUP_DIR/uploads-$DATE.tar.gz"
fi

find "$BACKUP_DIR" -type f \( -name 'crito-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) бэкап готов: crito-$DATE.dump"
