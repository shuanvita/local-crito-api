import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Grant, Principal } from '../src/auth/auth.types.js';
import { SessionService } from '../src/auth/session.service.js';
import { PrismaService } from '../src/common/prisma.service.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  sessions: SessionService;
  /** Токен сессии пользователя с заданными правами. */
  login(email: string, options?: { superAdmin?: boolean; grants?: Grant[] }): Promise<string>;
}

export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const sessions = app.get(SessionService);

  return {
    app,
    prisma,
    sessions,
    async login(email, options = {}) {
      // Пользователь должен существовать в БД: на него ссылаются версии страниц и файлы.
      const user = await prisma.user.upsert({
        where: { externalId: `e2e:${email}` },
        create: { externalId: `e2e:${email}`, email },
        update: {},
      });
      const principal: Principal = {
        userId: user.id,
        email,
        isSuperAdmin: options.superAdmin ?? false,
        grants: options.grants ?? [],
      };
      return (await sessions.issue(principal)).token;
    },
  };
}

/** Короткие обёртки над supertest с авторизацией. */
export function client(app: INestApplication) {
  const http = () => request(app.getHttpServer());
  const withToken = <T extends request.Test>(test: T, token?: string) =>
    token ? (test.set('Authorization', `Bearer ${token}`) as T) : test;

  return {
    get: (path: string, token?: string) => withToken(http().get(path), token),
    post: (path: string, token?: string) => withToken(http().post(path), token),
    put: (path: string, token?: string) => withToken(http().put(path), token),
    patch: (path: string, token?: string) => withToken(http().patch(path), token),
    delete: (path: string, token?: string) => withToken(http().delete(path), token),
  };
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface WebhookRecorder {
  url: string;
  calls: Array<{ method?: string; secret?: string }>;
  close(): Promise<void>;
}

/** Локальный HTTP-сервер, который запоминает вызовы вебхука ревалидации. */
export async function startWebhookRecorder(): Promise<WebhookRecorder> {
  const calls: WebhookRecorder['calls'] = [];
  const server: Server = createServer((req, res) => {
    calls.push({ method: req.method, secret: req.headers['x-revalidate-secret'] as string | undefined });
    res.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/revalidate`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
