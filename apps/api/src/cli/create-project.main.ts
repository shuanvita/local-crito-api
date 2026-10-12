/**
 * Создание проекта из консоли: на проде войти в админку для `POST /projects` нельзя, а проект нужен
 * раньше, чем появится манифест и страницы.
 *
 *   npm run build -w @crito/api
 *   node apps/api/dist/cli/create-project.main.js --slug rucode --name RuCode \
 *     [--revalidate-url https://site/api/revalidate] [--revalidate-secret <секрет>]
 *
 * Работает напрямую с БД через сервисы приложения (без HTTP и входа): запускается оператором на сервере.
 * Ключ CI печатается один раз, в БД хранится только его хеш.
 */
import { NestFactory } from '@nestjs/core';
import { parseArgs } from 'node:util';
import { AppModule } from '../app.module.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { CreateProjectDto } from '../projects/projects.dto.js';
import { ProjectsService } from '../projects/projects.service.js';
import { validate } from 'class-validator';

const { values } = parseArgs({
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    'default-locale': { type: 'string' },
    'revalidate-url': { type: 'string' },
    'revalidate-secret': { type: 'string' },
  },
});

if (!values.slug || !values.name) {
  console.error(
    'Использование: --slug <slug> --name <название> [--default-locale ru] [--revalidate-url <url>] [--revalidate-secret <секрет>]',
  );
  process.exit(2);
}

const dto = Object.assign(new CreateProjectDto(), {
  slug: values.slug,
  name: values.name,
  defaultLocale: values['default-locale'],
  revalidateUrl: values['revalidate-url'],
  revalidateSecret: values['revalidate-secret'],
});

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  // Те же правила, что у `POST /projects`: slug, адрес вебхука.
  const problems = (await validate(dto, { whitelist: true })).flatMap((issue) => Object.values(issue.constraints ?? {}));
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const prisma = app.get(PrismaService);
  const user = await prisma.user.upsert({
    where: { externalId: 'cli' },
    create: { externalId: 'cli', email: 'cli@localhost', name: 'Консоль оператора' },
    update: {},
  });
  const principal: Principal = { userId: user.id, email: user.email, name: user.name ?? undefined, isSuperAdmin: true, grants: [] };

  const { project, ciKey } = await app.get(ProjectsService).create(principal, dto);
  console.log(`Проект создан: ${project.slug} (${project.name})`);
  console.log('Ключ CI (показывается один раз, сохраните в секретах CI сайта):');
  console.log(ciKey);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
