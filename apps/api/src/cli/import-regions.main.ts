/**
 * Импорт справочника «Регионы» проекта из файла.
 *
 *   npm run build -w @crito/api
 *   node apps/api/dist/cli/import-regions.main.js --file scripts/rucode/regions.json --project rucode [--dry-run] [--overwrite]
 *
 * Работает напрямую с БД (без HTTP и входа): запускается оператором на сервере. После записи вызывает
 * вебхук сайта, чтобы он перечитал справочник.
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
    project: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
  },
});

if (!values.file || !values.project) {
  console.error('Использование: --file <regions.json> --project <slug> [--dry-run] [--overwrite]');
  process.exit(2);
}

const data = JSON.parse(readFileSync(resolve(values.file), 'utf8')) as RegionsFile;
if (data.project !== values.project) {
  console.error(`Файл относится к проекту "${data.project}", а импорт запущен для "${values.project}"`);
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const prisma = app.get(PrismaService);
  const revalidate = app.get(RevalidateService);

  const project = await prisma.project.findUnique({
    where: { slug: values.project },
    select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true },
  });
  if (!project) {
    throw new Error(`Проект "${values.project}" не найден. Создайте его (POST /projects).`);
  }

  const existing = await prisma.region.findMany({
    where: { projectId: project.id },
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
          data: { projectId: project.id, value: action.value, label: action.label, sortOrder: action.sortOrder },
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
    revalidate.notify(project);
    await revalidate.flush();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
