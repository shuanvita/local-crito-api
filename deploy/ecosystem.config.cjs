const { existsSync, readFileSync } = require('node:fs')

// pm2 для CMS на одном сервере с сайтом rucode (у него порт 3000, поэтому API здесь 3200).
// Настройки (DATABASE_URL, SESSION_SECRET, SECRETS_KEY, PUBLIC_BASE_URL, ADMIN_TOKEN, STORAGE_LOCAL_DIR, NUXT_*)
// лежат в одном файле site.env вне репозитория, чтобы деплой, который перезаписывает этот файл, их не затирал.
// Разбор написан вручную, без util.parseEnv: pm2 может работать на старом Node, а ошибка в этом файле
// не должна мешать запуску, поэтому при любом сбое возвращаются пустые настройки.
const ROOT = '/var/www/edu.mipt.ru/adm/cms-admin'
const SITE_ENV = `${ROOT}/site.env`

function readEnvFile(file) {
  try {
    if (!existsSync(file)) return {}
    const env = {}
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
      if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
    return env
  } catch {
    return {}
  }
}

// Один файл на оба процесса, но каждый получает только своё: админке не нужны секреты API
// (DATABASE_URL, SECRETS_KEY...), API не нужны переменные Nuxt (NUXT_*).
const site = readEnvFile(SITE_ENV)
const pick = (test) => Object.fromEntries(Object.entries(site).filter(([key]) => test(key)))
const apiEnv = pick((key) => !key.startsWith('NUXT_'))
const adminEnv = pick((key) => key.startsWith('NUXT_'))
// Служебный токен админки это ADMIN_TOKEN API: отдельную строку в site.env заводить не нужно.
const adminToken = site.NUXT_ADMIN_TOKEN || site.ADMIN_TOKEN

module.exports = {
  apps: [
    {
      name: 'crito-api',
      cwd: `${ROOT}/api`,
      script: './dist/main.js',
      interpreter: '/root/.nvm/versions/node/v24.22.0/bin/node',
      // Один процесс: локальное хранилище файлов и вебхуки не рассчитаны на кластер.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        ...apiEnv,
        NODE_ENV: 'production',
        PORT: '3200',
        HOST: '127.0.0.1',
      },
    },
    {
      name: 'cms-admin',
      cwd: ROOT,
      script: './.output/server/index.mjs',
      interpreter: '/root/.nvm/versions/node/v24.22.0/bin/node',
      exec_mode: 'fork',
      instances: 1,
      env: {
        ...adminEnv,
        ...(adminToken ? { NUXT_ADMIN_TOKEN: adminToken } : {}),
        NODE_ENV: 'production',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: '3100',
        NUXT_API_URL: 'http://127.0.0.1:3200',
        NUXT_APP_BASE_URL: process.env.CRITO_ADMIN_BASE || '/adm/cms-admin/',
      },
    },
  ],
}
