import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../common/prisma.service.js';
import { AuthGuard } from './auth.guard.js';
import type { SessionService } from './session.service.js';

const ADMIN_TOKEN = 'a-long-admin-token-for-unit-tests-0123456789';

function setup(adminToken: string | undefined) {
  const upsert = vi.fn().mockResolvedValue({ id: 'u1', email: 'admin@localhost', name: 'Администратор' });
  const verify = vi.fn().mockResolvedValue(null);
  const guard = new AuthGuard(
    { getAllAndOverride: () => false } as unknown as Reflector,
    { verify } as unknown as SessionService,
    { user: { upsert } } as unknown as PrismaService,
    { get: (name: string) => (name === 'ADMIN_TOKEN' ? adminToken : undefined) } as unknown as ConfigService,
  );
  const run = (authorization?: string) => {
    const request: { headers: Record<string, string>; principal?: { isSuperAdmin: boolean } } = {
      headers: authorization ? { authorization } : {},
    };
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { result: guard.canActivate(context), request };
  };
  return { run, upsert, verify };
}

describe('AuthGuard: служебный ADMIN_TOKEN', () => {
  it('верный токен даёт суперадмина и не обращается к проверке сессий', async () => {
    const { run, verify, upsert } = setup(ADMIN_TOKEN);
    const { result, request } = run(`Bearer ${ADMIN_TOKEN}`);
    await expect(result).resolves.toBe(true);
    expect(request.principal?.isSuperAdmin).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('неверный токен и токен без префикса Bearer отклоняются', async () => {
    const { run } = setup(ADMIN_TOKEN);
    await expect(run(`Bearer ${ADMIN_TOKEN}x`).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(ADMIN_TOKEN).result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run().result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('без ADMIN_TOKEN в конфигурации пустой и любой токен не проходят', async () => {
    const { run } = setup(undefined);
    await expect(run('Bearer ').result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(run(`Bearer ${ADMIN_TOKEN}`).result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('пользователь заводится один раз на процесс', async () => {
    const { run, upsert } = setup(ADMIN_TOKEN);
    await run(`Bearer ${ADMIN_TOKEN}`).result;
    await run(`Bearer ${ADMIN_TOKEN}`).result;
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
