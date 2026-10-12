#!/usr/bin/env bash
# Бэкап БД CMS и файлов медиатеки. Запускать по cron ежедневно, например:
#   17 3 * * * /var/www/crito/deploy/backup.sh >> /var/log/crito-backup.log 2>&1
#
# Копии лежат на том же сервере: это защита от ошибок и неудачных миграций, но не от потери диска.
# Периодически забирайте каталог BACKUP_DIR на другую машину.
# SECRETS_KEY (/etc/crito/api.env) бэкапьте отдельно: без него секреты вебхуков в дампе не расшифровать.
set -euo pipefail

BACKUP_DIR="${CRITO_BACKUP_DIR:-/var/backups/crito}"
KEEP_DAYS="${CRITO_BACKUP_KEEP_DAYS:-14}"
DATE="$(date +%F)"

set -a
# shellcheck disable=SC1091
. /etc/crito/api.env
set +a

mkdir -p "$BACKUP_DIR"
umask 077

# Дамп пишется во временный файл и переименовывается: оборванный бэкап не подменяет хороший.
pg_dump --format=custom --file "$BACKUP_DIR/crito-$DATE.dump.tmp" "${DATABASE_URL%%\?*}"
mv "$BACKUP_DIR/crito-$DATE.dump.tmp" "$BACKUP_DIR/crito-$DATE.dump"

if [ -d "${STORAGE_LOCAL_DIR:-}" ]; then
  tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz.tmp" -C "$STORAGE_LOCAL_DIR" .
  mv "$BACKUP_DIR/uploads-$DATE.tar.gz.tmp" "$BACKUP_DIR/uploads-$DATE.tar.gz"
fi

find "$BACKUP_DIR" -type f \( -name 'crito-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) бэкап готов: crito-$DATE.dump"
