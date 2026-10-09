// Экспорт контента страниц rucode из локальных данных фронтенда в JSON.
//
//   node scripts/rucode/export.mjs --front <путь к репозиторию фронтенда> [--out pages.json]
//
// Скрипт на время запуска копирует export-pages.test.ts во фронтенд (src/__crito_export__),
// запускает его vitest и удаляет копию. Файлы фронтенда не изменяются.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    front: { type: 'string' },
    out: { type: 'string', default: 'scripts/rucode/pages.json' },
  },
})

if (!values.front) {
  console.error('Укажите путь к фронтенду: --front <путь>')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const front = resolve(values.front)
const out = resolve(values.out)

if (!existsSync(join(front, 'node_modules'))) {
  console.error(`Во фронтенде не установлены зависимости: выполните npm install в ${front}`)
  process.exit(2)
}

const tempDir = join(front, 'src', '__crito_export__')
const tempFile = join(tempDir, 'export-pages.test.ts')

mkdirSync(tempDir, { recursive: true })
copyFileSync(join(here, 'export-pages.test.ts'), tempFile)

let status = 1
try {
  const result = spawnSync('npx', ['vitest', 'run', 'src/__crito_export__/export-pages.test.ts'], {
    cwd: front,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, EXPORT_OUT: out },
  })
  status = result.status ?? 1
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

if (status === 0) console.log(`\nГотово: ${out}`)
else console.error('\nЭкспорт завершился с ошибкой (см. вывод выше).')
process.exit(status)
