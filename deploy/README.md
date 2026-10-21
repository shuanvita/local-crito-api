# Развёртывание CMS рядом с сайтом rucode (pm2 + nginx)

Схема для сервера, где уже работает `nuxt.rucode.net` (pm2, nginx, Node 24):

```
браузер ─▶ nginx nuxt.rucode.net ─┬─ /admin/*        (basic auth) ─▶ админка 127.0.0.1:3100 ─▶ API
                                  ├─ /cms-api/public|media|health ─▶ API 127.0.0.1:3200
                                  ├─ PUT /cms-api/projects/<p>/manifest (ключ CI) ─▶ API
                                  └─ остальное ─▶ сайт rucode 127.0.0.1:3000 (pm2, уже работает)
сайт rucode ─▶ http://127.0.0.1:3200/public/rucode   (серверный прокси сайта, без nginx)
```

Порты: сайт 3000 (занят), админка **3100**, API **3200**. Остальные админские методы API снаружи закрыты nginx.

> **Боевой сервер (edu.mipt.ru).** Админка работает под `https://edu.mipt.ru/adm/cms-admin/`, а на диске это папка `/home/anvshurygin/cms-admin` (pm2 и nginx видят её как `/var/www/edu.mipt.ru/adm/cms-admin`, путь зашит в `ecosystem.config.cjs`). В неё GitHub Actions кладёт **готовую сборку**, а не репозиторий:
>
> ```
> cms-admin/
>   .output/                    сборка админки (Nitro), pm2-процесс cms-admin на 127.0.0.1:3100
>   api/dist, api/prisma ...    собранный API и миграции, pm2-процесс crito-api на 127.0.0.1:3200
>   api/node_modules, node_modules   production-зависимости API
>   ecosystem.config.cjs        конфиг pm2 (копия deploy/ecosystem.config.cjs)
>   deploy/                     deploy.sh, backup.sh
>   site.env                    настройки (вне репозитория, деплой его не трогает)
> ```
>
> Разделы 2 и 4 ниже описывают исходную схему с `/etc/crito` и `/var/www/crito`; для боевого сервера действуют раздел 8 и эта раскладка.

> Админка не имеет собственного входа: прокси подставляет служебный токен. Единственная защита это `auth_basic` в nginx.
> Проверка после настройки обязательна: `curl -i https://nuxt.rucode.net/admin/` без пароля должен дать **401**.

## 1. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib        # версия из дистрибутива подходит (проверялось на 17)
sudo -u postgres psql <<'SQL'
CREATE ROLE crito LOGIN PASSWORD '<сгенерируйте длинный пароль>';
CREATE DATABASE crito OWNER crito;
SQL
```

Порт 5432 наружу не открывайте (`listen_addresses = 'localhost'`, по умолчанию так).

## 2. Каталоги, секреты, код

```bash
sudo mkdir -p /etc/crito /var/lib/crito/uploads /var/www/crito /var/backups/crito
sudo chown -R "$USER": /etc/crito /var/lib/crito /var/www/crito /var/backups/crito
chmod 700 /etc/crito

# Код доставляет GitHub Actions (rsync по ssh), git на сервере не нужен.
# Для первого запуска без Actions скопируйте репозиторий в /var/www/crito любым способом (scp, rsync, git clone).
```

`/etc/crito/api.env` (`chmod 600`; **вне репозитория**, значения сгенерируйте сами):

```ini
DATABASE_URL=postgresql://crito:<пароль>@127.0.0.1:5432/crito?schema=public
PUBLIC_BASE_URL=https://nuxt.rucode.net/cms-api
SESSION_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
SECRETS_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
ADMIN_TOKEN=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/lib/crito/uploads
```

`/etc/crito/admin.env` (`chmod 600`):

```ini
NUXT_ADMIN_TOKEN=<то же значение, что ADMIN_TOKEN>
```

- `PUBLIC_BASE_URL` попадает в ссылки на файлы внутри страниц: менять его позже значит мигрировать данные.
- Сохраните `SECRETS_KEY` отдельно от сервера и бэкапов БД.
- `NODE_ENV`, `PORT`, `HOST` задаёт `ecosystem.config.cjs`, `AUTH_DEV_BYPASS` не задавайте вообще.

## 3. nginx

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-crito <логин>      # пароль редакторов; следующих добавляйте без -c
```

Вставьте содержимое [`nginx-cms.conf`](nginx-cms.conf) в `server { }` сайта `nuxt.rucode.net` **перед** `location /`, затем `sudo nginx -t && sudo systemctl reload nginx`.

## 4. Первый запуск

```bash
cd /var/www/crito && bash deploy/deploy.sh               # npm ci, сборка, миграции, pm2, проверка /health
```

Если `deploy.sh` падает до миграций, проверьте `/etc/crito/api.env` и `pm2 logs crito-api`.

Проект и ключ CI (показывается один раз; сохраните в GitHub Secrets сайта как `CRITO_CI_KEY`):

```bash
set -a; . /etc/crito/api.env; set +a
cd /var/www/crito
node apps/api/dist/cli/create-project.main.js --slug rucode --name RuCode \
  --revalidate-url http://127.0.0.1:3000/api/revalidate --revalidate-secret '<секрет вебхука>'
```

Секрет вебхука должен совпасть с `NUXT_REVALIDATE_SECRET` сайта.

## 5. Проверка

| Проверка | Ожидается |
|---|---|
| `curl -i https://nuxt.rucode.net/admin/` | 401 (без пароля) |
| `curl -u <логин> https://nuxt.rucode.net/admin/` | 200, открывается админка |
| `curl https://nuxt.rucode.net/cms-api/health` | `{"status":"ok","database":"up"}` |
| `curl -i https://nuxt.rucode.net/cms-api/projects` | 404 (админские методы снаружи закрыты) |
| `curl -i https://nuxt.rucode.net/cms-api/public/rucode/pages/index` | 404 до импорта, 200 после |
| `curl -i -X PUT https://nuxt.rucode.net/cms-api/projects/rucode/manifest` | 401 (нет ключа CI), не 404 и не 405 |
| `ss -ltnp \| grep -E ':(3100\|3200)'` | слушают только `127.0.0.1` |

## 6. Подключение сайта rucode (изменения в его репозитории)

1. **Переменные сайта** (в `ecosystem.config.cjs` сайта, значения не из репозитория; у сайта `exec_mode: cluster`, переменные задаются через окружение pm2 или файл):
   - `NUXT_CMS_BASE_URL=http://127.0.0.1:3200/public/rucode` (серверный запрос без nginx);
   - `NUXT_REVALIDATE_SECRET=<секрет вебхука>`.
2. **Шаг в workflow сайта после деплоя** (секрет `CRITO_CI_KEY` в GitHub Secrets):

   ```yaml
   - name: Publish blocks manifest to CMS
     run: |
       npm run manifest
       curl -fsS -X PUT "https://nuxt.rucode.net/cms-api/projects/rucode/manifest" \
         -H "x-ci-key: ${{ secrets.CRITO_CI_KEY }}" -H "content-type: application/json" \
         --data-binary @.output/manifest.json
   ```
3. **Правки сайта** (из TODO README): `richText()` у `award.hero.title`, `personQuote.text`, `personQuote.role`; убрать `id` из `v-bind="item"` в виджетах.
4. **Кэш в кластере.** Сайт запущен в `cluster` с `instances: max`, а вебхук сброса кэша попадает в один из процессов. Остальные подхватят изменение по TTL (около 60 секунд). Это ожидаемо; если нужно мгновенно, уменьшите `NUXT_CMS_CACHE_TTL`.

## 7. Перенос контента

```bash
# На своей машине (внутри клона rucode, см. README корня):
npm run export:rucode -- --front <путь к rucode> --out scripts/rucode/pages.json
scp scripts/rucode/pages.json <сервер>:/tmp/pages.json

# На сервере:
cd ~/cms-admin && set -a && . ./site.env && set +a      # на боевом сервере; значения с пробелами и & в site.env берите в кавычки
node api/dist/cli/import-pages.main.js --file /tmp/pages.json --project rucode --dry-run
node api/dist/cli/import-pages.main.js --file /tmp/pages.json --project rucode
rm /tmp/pages.json
```

Манифест должен быть загружен до импорта (шаг 6.2 или `curl` вручную с ключом CI).

## 8. Обновления и бэкапы

- **GitHub Actions** (`.github/workflows/deploy.yml`): на push в `main` прогоняет типы, тесты и e2e, затем **на раннере** собирает API и админку (`npm run build` с `NUXT_APP_BASE_URL=/adm/cms-admin/`), ставит production-зависимости API (`npm ci --omit=dev -w @crito/api`), раскладывает результат `deploy/stage.sh`, копирует его в `~/cms-admin` через `rsync --delete` и по ssh запускает `deploy/deploy.sh` (миграции, pm2, проверка `/health`). На сервере сборка и `npm ci` не нужны, доступ к GitHub не нужен. Секреты репозитория crito-api: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_PORT`; необязательный `SSH_KNOWN_HOSTS` (вывод `ssh-keyscan -p <порт> <хост>`) закрепляет отпечаток сервера. На сервере нужен `rsync`.
- **Что rsync не трогает:** `site.env`, `polyfill-crypto.mjs`, `api/uploads/` (хранилище файлов по умолчанию, если `STORAGE_LOCAL_DIR` не задан) и `.env*` в корне. Всё остальное в `~/cms-admin`, чего нет в собранной папке, удаляется (`--delete`): не храните там свои файлы. `STORAGE_LOCAL_DIR` лучше вынести за пределы `cms-admin` (например `/home/anvshurygin/crito-data/uploads`).
- **`site.env`** (`chmod 600`, лежит в корне `cms-admin`, один файл на оба процесса): `DATABASE_URL`, `PUBLIC_BASE_URL`, `SESSION_SECRET`, `SECRETS_KEY`, `ADMIN_TOKEN`, `STORAGE_LOCAL_DIR` и др. переменные API, а также `NUXT_*`. `ecosystem.config.cjs` раздаёт `NUXT_*` только админке, остальное только API; `NUXT_ADMIN_TOKEN` берётся из `ADMIN_TOKEN`. `deploy.sh` и `backup.sh` берут из него `DATABASE_URL` (и `STORAGE_LOCAL_DIR`), не исполняя файл как shell.
- **Пробный запуск:** Actions → Deploy CMS → Run workflow с галочкой `dry_run`: сборка выполняется, в логе будет список файлов, которые изменятся, ничего не копируется и не перезапускается.
- **Префикс админки:** `/adm/cms-admin/` задаётся при сборке в workflow (`NUXT_APP_BASE_URL`) и при запуске в `ecosystem.config.cjs` (по умолчанию он же, переопределяется `CRITO_ADMIN_BASE`). Префикс в сборке и в nginx должны совпадать, иначе ассеты `_nuxt` уйдут на сайт и вернут 404.
- **Переменные:** `CRITO_ROOT` (по умолчанию `/var/www/edu.mipt.ru/adm/cms-admin`; workflow передаёт `$HOME/cms-admin`), `CRITO_PM2` (по умолчанию `/usr/local/bin/pm2`). Ручной запуск: `CRITO_ROOT=~/cms-admin bash ~/cms-admin/deploy/deploy.sh`.
- **Первый деплой в эту папку:** если раньше запускались процессы `crito-api` и `crito-admin` из другой папки, выполните `pm2 delete crito-api crito-admin`: `reload` не меняет рабочую папку, а админка теперь называется `cms-admin` и занимает тот же порт 3100.
- **Бэкап:** `crontab -e` → `17 3 * * * bash ~/cms-admin/deploy/backup.sh >> ~/crito-backup.log 2>&1`. Копии на том же сервере (`/var/backups/crito` или `CRITO_BACKUP_DIR`), периодически забирайте их на другую машину.
- **Перед обновлением с миграциями** запустите `bash deploy/backup.sh` вручную.
- **Откат кода:** `git revert` проблемного коммита и push в `main` (Actions доставит прежний код) или Run workflow на ветке или теге с нужным кодом; миграции назад не откатываются, восстановление только из дампа.

## Что дальше

- Вход через LMS: после него `ADMIN_TOKEN`/`NUXT_ADMIN_TOKEN` удаляются из окружения, а basic auth можно снять.
- Файлы на диске сервера, S3 не подключён.
