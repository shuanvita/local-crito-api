#!/usr/bin/env bash
# Собирает на раннере готовую раскладку папки cms-admin, которая целиком копируется на сервер (см. deploy/README.md):
#
#   .output/                  сборка админки (Nitro)
#   api/dist, api/prisma ...  собранный API и миграции
#   api/node_modules, node_modules   production-зависимости API (раскладка как в репозитории)
#   ecosystem.config.cjs      конфиг pm2
#   deploy/                   deploy.sh и backup.sh
#
# Запускать из корня репозитория после `npm run build` и `npm ci --omit=dev -w @crito/api`.
# Использование: bash deploy/stage.sh <папка-назначения>
set -euo pipefail

out="${1:?Укажите папку назначения}"

for required in apps/admin/.output/server/index.mjs apps/api/dist/main.js node_modules; do
  if [ ! -e "$required" ]; then
    echo "Нет $required: сначала сборка и установка production-зависимостей" >&2
    exit 1
  fi
done

rm -rf "$out"
mkdir -p "$out/api" "$out/deploy"

cp -a apps/admin/.output "$out/.output"
cp -a apps/api/dist "$out/api/dist"
cp -a apps/api/prisma "$out/api/prisma"
cp apps/api/prisma.config.ts apps/api/package.json "$out/api/"

# @crito/contract только типы: в рантайме он не нужен, а ссылка на workspace после копирования была бы битой.
mkdir -p "$out/node_modules"
rsync -a --exclude='/@crito/' node_modules/ "$out/node_modules/"
if [ -d apps/api/node_modules ]; then
  mkdir -p "$out/api/node_modules"
  rsync -a --exclude='/@crito/' apps/api/node_modules/ "$out/api/node_modules/"
fi

cp deploy/ecosystem.config.cjs "$out/ecosystem.config.cjs"
cp deploy/deploy.sh deploy/backup.sh "$out/deploy/"

echo "Папка для сервера готова: $out"
