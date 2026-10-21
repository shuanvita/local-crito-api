#!/usr/bin/env bash
# Обновление CMS на сервере: миграции и перезапуск. Сборка и зависимости приходят готовыми (deploy/stage.sh на раннере).
# Запускается из GitHub Actions по ssh (см. .github/workflows/deploy.yml) или вручную: bash deploy/deploy.sh
#
# Перед миграциями нужен свежий бэкап БД (deploy/backup.sh): миграции иногда меняют типы колонок.
set -euo pipefail

# Всё в функции: rsync может заменить этот файл на лету, а bash читает скрипт по частям.
main() {
  local root="${CRITO_ROOT:-/var/www/edu.mipt.ru/adm/cms-admin}"
  local pm2="${CRITO_PM2:-/usr/local/bin/pm2}"

  cd "$root"
  local required
  for required in .output/server/index.mjs api/dist/main.js api/node_modules ecosystem.config.cjs; do
    if [ ! -e "$required" ]; then
      echo "В $root нет $required: папка не похожа на собранную CMS" >&2
      return 1
    fi
  done
  if [ ! -f site.env ]; then
    echo "В $root нет site.env с настройками (DATABASE_URL и др.)" >&2
    return 1
  fi

  # Из site.env берётся только адрес БД: файл не исполняется как shell, значения с пробелами и & безопасны.
  local database_url
  database_url="$(sed -n 's/^[[:space:]]*DATABASE_URL[[:space:]]*=[[:space:]]*//p' site.env | tail -n 1 | tr -d '\r' | sed -E "s/^(['\"])(.*)\1\$/\2/")"
  if [ -z "$database_url" ]; then
    echo "В site.env не задан DATABASE_URL" >&2
    return 1
  fi
  (cd api && DATABASE_URL="$database_url" ./node_modules/.bin/prisma migrate deploy)

  "$pm2" startOrReload ecosystem.config.cjs --update-env
  "$pm2" save

  # Проверка живости: без неё сбой запуска (например, пропавшая переменная) остался бы незамеченным.
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:3200/health >/dev/null; then
      echo "API отвечает"
      return 0
    fi
    sleep 2
  done
  echo "API не отвечает на /health после перезапуска" >&2
  "$pm2" logs crito-api --lines 30 --nostream || true
  return 1
}

main "$@"
exit $?
