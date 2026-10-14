/**
 * Импорт общего справочника «Регионы» из файла.
 *
 *   npm run build -w @crito/api
 *   node apps/api/dist/cli/import-regions.main.js --file scripts/rucode/regions.json [--dry-run] [--overwrite]
 *
 * Работает напрямую с БД (без HTTP и входа): запускается оператором на сервере. После записи вызывает
 * вебхуки всех сайтов, чтобы они перечитали справочник.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { RevalidateService } from '../pages/revalidate.service.js';
import { planRegionImport } from './import-regions.js';
import type { RegionsFile } from './import-regions.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
  },
});

if (!values.file) {
  console.error('Использование: --file <regions.json> [--dry-run] [--overwrite]');
  process.exit(2);
}

const data = JSON.parse(readFileSync(resolve(values.file), 'utf8')) as RegionsFile;

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const prisma = app.get(PrismaService);
  const revalidate = app.get(RevalidateService);

  const existing = await prisma.region.findMany({
    select: { id: true, value: true, label: true, sortOrder: true },
  });
  const actions = planRegionImport(existing, data, { overwrite: values.overwrite });
  const dryRun = values['dry-run'];

  for (const action of actions) {
    if (action.kind === 'skip') {
      console.log(`пропущен  ${action.value} ${action.label} — ${action.reason}`);
      continue;
    }
    if (!dryRun) {
      if (action.kind === 'create') {
        await prisma.region.create({
          data: { value: action.value, label: action.label, sortOrder: action.sortOrder },
        });
      } else {
        await prisma.region.update({
          where: { id: action.id },
          data: { label: action.label, sortOrder: action.sortOrder },
        });
      }
    }
    console.log(`${action.kind === 'create' ? 'создан   ' : 'обновлён '} ${action.value} ${action.label}`);
  }

  const count = (kind: string) => actions.filter((action) => action.kind === kind).length;
  console.log(
    `\nИтого: ${actions.length}, создано: ${count('create')}, обновлено: ${count('update')}, пропущено: ${count('skip')}` +
      (dryRun ? ' (пробный запуск, ничего не записано)' : ''),
  );
  if (!dryRun && count('create') + count('update') > 0) {
    const projects = await prisma.project.findMany({
      where: { revalidateUrl: { not: null } },
      select: { slug: true, revalidateUrl: true, revalidateSecret: true },
    });
    for (const project of projects) revalidate.notify(project);
    await revalidate.flush();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
