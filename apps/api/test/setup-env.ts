import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { E2E_DB_NAME, e2eDatabaseUrl } from './db.js';

/**
 * Окружение e2e-тестов. Задаётся до загрузки приложения; значения из .env их не перекрывают.
 * Вход не обходится (AUTH_DEV_BYPASS=false): тесты работают с настоящими сессиями.
 */
process.env.DATABASE_URL = e2eDatabaseUrl();
process.env.AUTH_DEV_BYPASS = 'false';
process.env.SESSION_SECRET = 'e2e-session-secret-not-for-production';
process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.PUBLIC_BASE_URL = 'http://api.test';
process.env.ADMIN_TOKEN = 'e2e-admin-token-not-for-production-0123456789';
process.env.LMS_TRUST_SECRET = 'e2e-lms-trust-secret-not-for-production-0123456789';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = mkdtempSync(join(tmpdir(), 'crito-e2e-media-'));
process.env.NODE_ENV = 'test';

// Страховка: ни при каких условиях не работать с рабочей БД.
if (!process.env.DATABASE_URL.includes(`/${E2E_DB_NAME}`)) {
  throw new Error('e2e-тесты должны работать только с БД crito_e2e');
}
