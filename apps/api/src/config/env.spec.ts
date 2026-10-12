import { randomBytes } from 'node:crypto';
import { validateEnvironment } from './env.js';
import { isDevelopmentEnv } from './runtime.js';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/crito',
  SESSION_SECRET: 'x'.repeat(40),
  SECRETS_KEY: randomBytes(32).toString('base64'),
  PUBLIC_BASE_URL: 'https://api.example.ru',
};

describe('isDevelopmentEnv', () => {
  it('разработка включается только явно', () => {
    expect(isDevelopmentEnv('development')).toBe(true);
    expect(isDevelopmentEnv('test')).toBe(true);
    expect(isDevelopmentEnv('production')).toBe(false);
    expect(isDevelopmentEnv(undefined)).toBe(false);
    expect(isDevelopmentEnv('')).toBe(false);
    expect(isDevelopmentEnv('staging')).toBe(false);
  });
});

describe('validateEnvironment', () => {
  it('принимает полную боевую конфигурацию', () => {
    expect(() => validateEnvironment(good)).not.toThrow();
  });

  it('в разработке нужна только БД', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://x' })).not.toThrow();
    expect(() => validateEnvironment({ NODE_ENV: 'development' })).toThrow('DATABASE_URL');
  });

  it('незаданный NODE_ENV считается боевым режимом и требует всей конфигурации', () => {
    const { NODE_ENV: _omit, ...withoutEnv } = good;
    expect(() => validateEnvironment(withoutEnv)).not.toThrow();
    expect(() => validateEnvironment({ DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'change-me' })).toThrow(
      /SESSION_SECRET[\s\S]*SECRETS_KEY[\s\S]*PUBLIC_BASE_URL/,
    );
  });

  it.each([
    ['SESSION_SECRET', 'change-me'],
    ['SESSION_SECRET', 'short'],
    ['SESSION_SECRET', ''],
    ['SECRETS_KEY', ''],
    ['SECRETS_KEY', 'not-a-key'],
    ['PUBLIC_BASE_URL', ''],
    ['PUBLIC_BASE_URL', 'api.example.ru'],
    ['AUTH_DEV_BYPASS', 'true'],
  ])('отклоняет %s=%j в боевом режиме', (name, value) => {
    expect(() => validateEnvironment({ ...good, [name]: value })).toThrow(name);
  });

  it('ADMIN_TOKEN необязателен, но слабый токен отклоняется в любом режиме', () => {
    expect(() => validateEnvironment({ ...good, ADMIN_TOKEN: 'a'.repeat(32) })).not.toThrow();
    expect(() => validateEnvironment({ ...good, ADMIN_TOKEN: '' })).not.toThrow();
    for (const weak of ['short', 'change-me', 'a'.repeat(31)]) {
      expect(() => validateEnvironment({ ...good, ADMIN_TOKEN: weak })).toThrow('ADMIN_TOKEN');
      expect(() => validateEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'x', ADMIN_TOKEN: weak })).toThrow(
        'ADMIN_TOKEN',
      );
    }
  });

  it('перечисляет все проблемы сразу и подсказывает, как включить разработку', () => {
    try {
      validateEnvironment({ DATABASE_URL: 'x', AUTH_DEV_BYPASS: 'true' });
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('AUTH_DEV_BYPASS');
      expect(message).toContain('SESSION_SECRET');
      expect(message).toContain('NODE_ENV=development');
    }
  });
});
