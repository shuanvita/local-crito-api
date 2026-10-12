// pm2 для CMS на одном сервере с сайтом rucode (у него порт 3000, поэтому API здесь 3200).
// Секреты лежат вне репозитория: /etc/crito/api.env и /etc/crito/admin.env (chmod 600, владелец пользователь деплоя).
const { readFileSync } = require('node:fs')
const { parseEnv } = require('node:util')

const NODE = process.env.CRITO_NODE || '/home/anvshurygin/.nvm/versions/node/v24.21.0/bin/node'
const ROOT = process.env.CRITO_ROOT || '/var/www/crito'

const readEnv = (file) => parseEnv(readFileSync(file, 'utf8'))

module.exports = {
  apps: [
    {
      name: 'crito-api',
      cwd: `${ROOT}/apps/api`,
      script: './dist/main.js',
      interpreter: NODE,
      // Один процесс: локальное хранилище файлов и вебхуки не рассчитаны на кластер.
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        ...readEnv('/etc/crito/api.env'),
        NODE_ENV: 'production',
        PORT: '3200',
        HOST: '127.0.0.1',
      },
    },
    {
      name: 'crito-admin',
      cwd: `${ROOT}/apps/admin`,
      script: './.output/server/index.mjs',
      interpreter: NODE,
      exec_mode: 'fork',
      instances: 1,
      env: {
        ...readEnv('/etc/crito/admin.env'),
        NODE_ENV: 'production',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: '3100',
        NUXT_API_URL: 'http://127.0.0.1:3200',
        NUXT_APP_BASE_URL: '/admin/',
      },
    },
  ],
}
