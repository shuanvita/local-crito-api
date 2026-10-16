/**
 * Импорт страниц в CMS из файла экспорта.
 *
 *   npm run build -w @crito/api
 *   node apps/api/dist/cli/import-pages.main.js --file scripts/rucode/pages.json --project rucode [--dry-run] [--overwrite]
 *
 * Работает напрямую с БД через сервисы приложения (без HTTP и входа): запускается оператором на сервере.
 * Манифест блоков проекта должен быть уже загружен.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AppModule } from '../app.module.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { ManifestService } from '../manifest/manifest.service.js';
import { PagesService } from '../pages/pages.service.js';
import { importPages } from './import-pages.js';
import type { ExportFile, ImportResult } from './import-pages.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    project: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
  },
});

if (!values.file || !values.project) {
  console.error('Использование: --file <pages.json> --project <slug> [--dry-run] [--overwrite]');
  process.exit(2);
}

const data = JSON.parse(readFileSync(resolve(values.file), 'utf8')) as ExportFile;

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const prisma = app.get(PrismaService);
  const pages = app.get(PagesService);
  const manifest = app.get(ManifestService);

  const project = await prisma.project.findUnique({ where: { slug: values.project }, select: { id: true } });
  if (!project) {
    throw new Error(`Проект "${values.project}" не найден. Создайте его (POST /projects) и загрузите манифест блоков.`);
  }

  const user = await prisma.user.upsert({
    where: { externalId: 'import-script' },
    create: { externalId: 'import-script', email: 'import@localhost', name: 'Импорт контента' },
    update: {},
  });
  const principal: Principal = { userId: user.id, email: user.email, name: user.name ?? undefined, isSuperAdmin: true, grants: [] };

  const results = await importPages(
    {
      principal,
      findPage: (slug, pageSlug) =>
        prisma.page
          .findFirst({ where: { slug: pageSlug, project: { slug } }, select: { id: true, version: true, deletedAt: true } })
          .then((page) => (page ? { id: page.id, version: page.version, deleted: page.deletedAt !== null } : null)),
      validateBlocks: (slug, blocks) => manifest.validateBlocks(slug, blocks),
      create: (p, slug, dto) => pages.create(p, slug, dto),
      update: (p, slug, id, dto) => pages.updateAndPublish(p, slug, id, dto),
    },
    data,
    { project: values.project, dryRun: values['dry-run'], overwrite: values.overwrite },
  );

  const label: Record<ImportResult['status'], string> = {
    created: 'создана',
    updated: 'обновлена',
    skipped: 'пропущена',
    valid: 'проверена',
    failed: 'ОШИБКА',
  };
  for (const result of results) {
    console.log(`${label[result.status].padEnd(10)} ${result.slug}${result.message ? ` — ${result.message}` : ''}`);
  }
  const failed = results.filter((result) => result.status === 'failed').length;
  console.log(`\nИтого: ${results.length}, ошибок: ${failed}${values['dry-run'] ? ' (пробный запуск, ничего не записано)' : ''}`);
  if (failed > 0) exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
