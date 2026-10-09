import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * `prisma generate` не подключается к БД, поэтому ему подходит заглушка: сборка и установка зависимостей
 * (CI, Docker) не должны требовать `DATABASE_URL`. Остальные команды (migrate, studio) берут настоящий адрес
 * и без него сразу падают с понятной ошибкой.
 */
const generating = process.argv.includes('generate');
const GENERATE_ONLY_URL = 'postgresql://generate-only@localhost:5432/generate-only';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL || (generating ? GENERATE_ONLY_URL : env('DATABASE_URL')) },
});
