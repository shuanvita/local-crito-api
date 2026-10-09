/**
 * Тестовая база. Это всегда отдельная БД `crito_e2e` на том же сервере Postgres: рабочая БД
 * разработки не затрагивается, даже если в apps/api/.env указана она.
 */
export const E2E_DB_NAME = 'crito_e2e';

/** Подключение с правом создавать и удалять базы (служебная БД postgres). */
export const ADMIN_DATABASE_URL =
  process.env.E2E_ADMIN_DATABASE_URL ?? 'postgresql://crito:crito@localhost:5432/postgres';

export function e2eDatabaseUrl(): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = `/${E2E_DB_NAME}`;
  url.search = '?schema=public';
  return url.toString();
}
