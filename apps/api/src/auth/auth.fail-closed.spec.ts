import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { MediaService } from '../media/media.service.js';
import type { PrismaService } from '../common/prisma.service.js';
import { SecretBox } from '../common/secret-box.js';
import { AuthGuard } from './auth.guard.js';
import type { LocalAuthService } from './local-auth.service.js';
import { SessionService } from './session.service.js';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

/** Выполняет проверку с заданным NODE_ENV (undefined = переменная не задана). */
function withNodeEnv<T>(value: string | undefined, action: () => T): T {
  const previous = process.env.NODE_ENV;
  if (value === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = value;
  try {
    return action();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

describe('закрытость по умолчанию: NODE_ENV не задан или не development', () => {
  it.each([undefined, 'production', 'staging', ''])('NODE_ENV=%j: небезопасные значения по умолчанию не принимаются', (env) => {
    withNodeEnv(env, () => {
      expect(() => new SessionService(config({}))).toThrow('SESSION_SECRET');
      expect(() => new SessionService(config({ SESSION_SECRET: 'change-me' }))).toThrow('SESSION_SECRET');
      expect(() => new SecretBox(config({}))).toThrow('SECRETS_KEY');
      expect(() => new MediaService({} as PrismaService, {} as never, {} as never, config({}))).toThrow('PUBLIC_BASE_URL');
      expect(
        () => new AuthGuard({} as Reflector, {} as SessionService, {} as PrismaService, {} as LocalAuthService, config({ AUTH_DEV_BYPASS: 'true' })),
      ).toThrow('AUTH_DEV_BYPASS');
    });
  });

  it.each(['development', 'test'])('NODE_ENV=%s: значения для разработки допустимы', (env) => {
    withNodeEnv(env, () => {
      expect(() => new SessionService(config({}))).not.toThrow();
      expect(() => new SecretBox(config({}))).not.toThrow();
      expect(() => new MediaService({} as PrismaService, {} as never, {} as never, config({}))).not.toThrow();
      expect(
        () => new AuthGuard({} as Reflector, {} as SessionService, {} as PrismaService, {} as LocalAuthService, config({ AUTH_DEV_BYPASS: 'true' })),
      ).not.toThrow();
    });
  });
});
