#!/usr/bin/env bash
# Обновление CMS на сервере: зависимости, сборка, миграции, перезапуск (код доставляется отдельно).
# Запускается из GitHub Actions по ssh (см. .github/workflows/deploy.yml) или вручную: bash deploy/deploy.sh
#
# Перед миграциями нужен свежий бэкап БД (deploy/backup.sh): миграции иногда меняют типы колонок.
set -euo pipefail

# Всё в функции: rsync может заменить этот файл на лету, а bash читает скрипт по частям.
main() {
  local root="${CRITO_ROOT:-/var/www/crito}"
  local pm2="${CRITO_PM2:-/usr/local/bin/pm2}"
  # Каталог с api.env и admin.env; ecosystem.config.cjs читает ту же переменную.
  export CRITO_ENV_DIR="${CRITO_ENV_DIR:-/etc/crito}"

  # Код сюда уже доставлен (rsync из GitHub Actions или вручную): git на сервере не нужен.
  cd "$root"
  if [ ! -f package-lock.json ] || [ ! -d deploy ]; then
    echo "$root не похож на каталог CMS (нет package-lock.json или deploy/)" >&2
    return 1
  fi

  npm ci

  # Админка живёт под префиксом (по умолчанию /admin/, на боевом сервере /cms-admin/): он влияет на адреса
  # ассетов, поэтому задаётся при сборке. ecosystem.config.cjs читает ту же переменную для запуска.
  export CRITO_ADMIN_BASE="${CRITO_ADMIN_BASE:-/admin/}"
  NUXT_APP_BASE_URL="$CRITO_ADMIN_BASE" npm run build

  # Миграциям нужен DATABASE_URL из окружения API.
  set -a
  # shellcheck disable=SC1091
  . "$CRITO_ENV_DIR/api.env"
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
