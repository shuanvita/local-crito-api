import { parseSecretsKey } from '../common/secret-box.js';
import { isDevelopmentEnv } from './runtime.js';

const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_ADMIN_TOKEN_LENGTH = 32;

/**
 * Проверка конфигурации при старте (подключена в `ConfigModule`). Приложение не запускается
 * с небезопасной или неполной конфигурацией; сообщение перечисляет все проблемы сразу.
 */
export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const text = (name: string): string => (typeof config[name] === 'string' ? (config[name] as string).trim() : '');
  const development = isDevelopmentEnv(config.NODE_ENV as string | undefined);
  const errors: string[] = [];

  if (!text('DATABASE_URL')) errors.push('DATABASE_URL не задан');

  // Слабый служебный токен хуже, чем его отсутствие, поэтому длину проверяем в любом режиме.
  const adminToken = text('ADMIN_TOKEN');
  if (adminToken && (adminToken.length < MIN_ADMIN_TOKEN_LENGTH || adminToken === 'change-me')) {
    errors.push(`ADMIN_TOKEN должен быть не короче ${MIN_ADMIN_TOKEN_LENGTH} символов или не задан`);
  }

  if (!development) {
    if (text('AUTH_DEV_BYPASS') === 'true') {
      errors.push('AUTH_DEV_BYPASS=true разрешён только при NODE_ENV=development');
    }

    const session = text('SESSION_SECRET');
    if (session.length < MIN_SESSION_SECRET_LENGTH || session === 'change-me') {
      errors.push(`SESSION_SECRET должен быть не короче ${MIN_SESSION_SECRET_LENGTH} символов и не равен значению по умолчанию`);
    }

    const secretsKey = text('SECRETS_KEY');
    if (!secretsKey) {
      errors.push('SECRETS_KEY не задан');
    } else {
      try {
        parseSecretsKey(secretsKey);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    const baseUrl = text('PUBLIC_BASE_URL');
    if (!/^https?:\/\/[^\s/]+/i.test(baseUrl)) {
      errors.push('PUBLIC_BASE_URL должен быть адресом вида https://api.example.ru: он попадает в ссылки на файлы внутри страниц');
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Некорректная конфигурация (NODE_ENV=${text('NODE_ENV') || 'не задан'}):\n - ${errors.join('\n - ')}\n` +
        'Для локальной разработки задайте NODE_ENV=development.',
    );
  }
  return config;
}
