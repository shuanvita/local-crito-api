/**
 * Создание пользователя (в том числе первого суперадмина) из консоли: войти в админку без учётной записи нельзя.
 *
 *   npm run build -w @crito/api
 *   CRITO_PASSWORD='<пароль не короче 10 символов>' \
 *     node apps/api/dist/cli/create-user.main.js --email admin@example.ru [--name Имя] [--super-admin]
 *
 * Пароль берётся из переменной `CRITO_PASSWORD` (или `--password`): переменная не остаётся в истории команд так явно.
 * Если пользователь с такой почтой уже есть, команда задаёт ему новый пароль (аварийный сброс) и обрывает его сессии.
 * Работает напрямую с БД через сервисы приложения, запускается оператором на сервере.
 */
import { NestFactory } from '@nestjs/core';
import { validate } from 'class-validator';
import { parseArgs } from 'node:util';
import { AppModule } from '../app.module.js';
import { CreateUserDto } from '../auth/auth.dto.js';
import type { Principal } from '../auth/auth.types.js';
import { normalizeEmail } from '../auth/local-auth.service.js';
import { UsersService } from '../auth/users.service.js';
import { PrismaService } from '../common/prisma.service.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    'super-admin': { type: 'boolean' },
  },
});

const password = values.password ?? process.env.CRITO_PASSWORD;
if (!values.email || !password) {
  console.error(
    'Использование: CRITO_PASSWORD=<пароль> create-user.main.js --email <почта> [--name <имя>] [--super-admin]',
  );
  process.exit(2);
}

const dto = Object.assign(new CreateUserDto(), {
  email: values.email,
  name: values.name,
  password,
  isSuperAdmin: values['super-admin'] ?? false,
});

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
let exitCode = 0;
try {
  const problems = (await validate(dto, { whitelist: true })).flatMap((issue) => Object.values(issue.constraints ?? {}));
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    exitCode = 1;
  } else {
    const prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    // Консоль оператора действует от имени суперадмина, как и create-project.
    const operator: Principal = { userId: 'cli', email: 'cli@localhost', isSuperAdmin: true, grants: [] };
    const existing = await prisma.user.findUnique({ where: { loginEmail: normalizeEmail(dto.email) } });
    if (existing) {
      await users.resetPassword(operator, existing.id, dto.password);
      console.log(`Пользователь ${existing.email} уже был: пароль заменён, сессии оборваны.`);
    } else {
      const created = await users.create(operator, dto);
      console.log(`Пользователь создан: ${created.email}${created.isSuperAdmin ? ' (суперадмин)' : ''}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
