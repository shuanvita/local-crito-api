#!/usr/bin/env bash
# Обновление CMS на сервере: миграции и перезапуск. Сборка и зависимости приходят готовыми (deploy/stage.sh на раннере).
# Запускается из GitHub Actions по ssh (см. .github/workflows/deploy.yml) или вручную: bash deploy/deploy.sh
#
# Перед миграциями нужен свежий бэкап БД (deploy/backup.sh): миграции иногда меняют типы колонок.
set -euo pipefail

# Всё в функции: rsync может заменить этот файл на лету, а bash читает скрипт по частям.
main() {
  local root="${CRITO_ROOT:-/var/www/edu.mipt.ru/adm/cms-admin}"
  local pm2="${CRITO_PM2:-pm2}" # путь к pm2 на серверах приложений; по умолчанию из PATH, как в update_pm2.sh

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

  # Эта машина (cron) только кладёт файлы на общий диск и гоняет миграции. Процессы pm2 живут на серверах
  # приложений, которые видят ту же папку как /var/www/edu.mipt.ru/adm/cms-admin (на cron этот путь закрыт).
  # Имена хостов (APP1, APP2) это алиасы из ~/.ssh/config пользователя деплоя на cron.
  local hosts="${CRITO_WEB_HOSTS:-}"
  if [ -z "$hosts" ]; then
    echo "CRITO_WEB_HOSTS не задан: файлы и миграции готовы, перезапустите pm2 на серверах приложений вручную" >&2
    return 0
  fi

  local web_root="${CRITO_WEB_ROOT:-/var/www/edu.mipt.ru/adm/cms-admin}"
  local host failed=0
  for host in $hosts; do
    echo "== $host =="
    # Без -t: в Actions нет терминала. Не delete+start, а startOrReload: процессы подхватывают новую сборку без простоя
    # и создаются, если их ещё нет; корень передаём аргументом (ssh не переносит окружение).
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" bash -s -- "$web_root" "$pm2" <<'REMOTE'
set -euo pipefail
root="$1"
pm2="$2"
"$pm2" startOrReload "$root/ecosystem.config.cjs" --update-env
"$pm2" save
# Проверка живости: без неё сбой запуска (например, пропавшая переменная) остался бы незамеченным.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3200/health >/dev/null; then
    echo "API отвечает"
    exit 0
  fi
  sleep 2
done
echo "API не отвечает на /health после перезапуска" >&2
"$pm2" logs crito-api --lines 30 --nostream || true
exit 1
REMOTE
    then
      echo "Перезапуск на $host не удался" >&2
      failed=1
    fi
  done
  return "$failed"
}

main "$@"
exit $?
