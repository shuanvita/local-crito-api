import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { ADMIN_DATABASE_URL, E2E_DB_NAME, e2eDatabaseUrl } from './db.js';

async function withAdminClient<T>(action: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Не удалось подключиться к Postgres (${(error as Error).message}). Запустите базу: npm run db:up`,
    );
  }
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

/** Создаёт чистую БД и применяет миграции перед прогоном; удаляет её после. */
export default async function setup() {
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${E2E_DB_NAME}`);
  });

  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    stdio: 'pipe',
  });

  return async () => {
    await withAdminClient((client) => client.query(`DROP DATABASE IF EXISTS ${E2E_DB_NAME} WITH (FORCE)`));
  };
}
