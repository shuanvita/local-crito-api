#!/usr/bin/env bash
# Обновление CMS на сервере: код, зависимости, сборка, миграции, перезапуск.
# Запускается из GitHub Actions по ssh (см. .github/workflows/deploy.yml) или вручную: bash deploy/deploy.sh
#
# Перед миграциями нужен свежий бэкап БД (deploy/backup.sh): миграции иногда меняют типы колонок.
set -euo pipefail

# Всё в функции: `git reset` ниже подменяет этот файл, а bash читает скрипт по частям.
main() {
  local root="${CRITO_ROOT:-/var/www/crito}"
  local branch="${CRITO_BRANCH:-main}"
  local pm2="${CRITO_PM2:-/usr/local/bin/pm2}"

  cd "$root"
  git fetch --quiet origin "$branch"
  git reset --hard "origin/$branch"

  npm ci

  # Админка живёт под /admin: префикс влияет на адреса ассетов, поэтому задаётся при сборке.
  NUXT_APP_BASE_URL=/admin/ npm run build

  # Миграциям нужен DATABASE_URL из окружения API.
  set -a
  # shellcheck disable=SC1091
  . /etc/crito/api.env
  set +a
  npm run db:migrate

  "$pm2" startOrReload deploy/ecosystem.config.cjs --update-env
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
