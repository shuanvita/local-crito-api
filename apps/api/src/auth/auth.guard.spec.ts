import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { PrismaService } from '../common/prisma.service.js';
import { AuthGuard } from './auth.guard.js';
import type { LmsAuthService } from './lms-auth.service.js';
import type { LocalAuthService } from './local-auth.service.js';
import type { SessionService } from './session.service.js';

const ADMIN_TOKEN = 'a-long-admin-token-for-unit-tests-0123456789';

function setup(adminToken: string | undefined) {
  const upsert = vi.fn().mockResolvedValue({ id: 'u1', email: 'admin@localhost', name: 'Администратор' });
  const verify = vi.fn().mockResolvedValue(null);
  const localVerify = vi.fn().mockResolvedValue(null);
  const lmsAuthenticate = vi.fn().mockResolvedValue(null);
  const guard = new AuthGuard(
    { getAllAndOverride: () => false } as unknown as Reflector,
    { verify } as unknown as SessionService,
    { user: { upsert } } as unknown as PrismaService,
    { verify: localVerify } as unknown as LocalAuthService,
    {
      carriesLmsHeaders: (headers: Record<string, unknown>) => headers['x-cms-secret'] !== undefined,
      authenticate: lmsAuthenticate,
    } as unknown as LmsAuthService,
    { get: (name: string) => (name === 'ADMIN_TOKEN' ? adminToken : undefined) } as unknown as ConfigService,
  );
  const run = (authorization?: string, extraHeaders: Record<string, string> = {}) => {
    const request: { headers: Record<string, string>; principal?: { isSuperAdmin: boolean } } = {
      headers: { ...(authorization ? { authorization } : {}), ...extraHeaders },
    };
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { result: guard.canActivate(context), request };
  };
  return { run, upsert, verify, localVerify, lmsAuthenticate };
}

describe('AuthGuard: вход из LMS по заголовкам', () => {
  const lmsPrincipal = { userId: 'u3', email: 'a@b.ru', isSuperAdmin: false, grants: [] };

  it('запрос с секретом проверяется только в LmsAuthService', async () => {
    const { run, lmsAuthenticate, verify, localVerify } = setup(ADMIN_TOKEN);
    lmsAuthenticate.mockResolvedValue(lmsPrincipal);
    const { result, request } = run(undefined, { 'x-cms-secret': 's' });
    await expect(result).resolves.toBe(true);
    expect(request.principal).toBe(lmsPrincipal);
    expect(verify).not.toHaveBeenCalled();
    expect(localVerify).not.toHaveBeenCalled();
  });

  it('неверный секрет даёт 401, даже если рядом валидный ADMIN_TOKEN', async () => {
    const { run } = setup(ADMIN_TOKEN);
    await expect(run(`Bearer ${ADMIN_TOKEN}`, { 'x-cms-secret': 'wrong' }).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('заголовки пользователя без секрета не дают входа', async () => {
    const { run, lmsAuthenticate } = setup(ADMIN_TOKEN);
    await expect(run(undefined, { 'x-cms-user-id': '1', 'x-cms-user-login': 'a@b.ru' }).result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(lmsAuthenticate).not.toHaveBeenCalled();
  });
});

describe('AuthGuard: серверные сессии входа по паролю', () => {
  const principal = { userId: 'u2', email: 'a@b.ru', isSuperAdmin: false, grants: [], sessionId: 's1' };

  it('токен с префиксом сессии проверяется только в LocalAuthService', async () => {
    const { run, verify, localVerify } = setup(ADMIN_TOKEN);
    localVerify.mockResolvedValue(principal);
    const { result, request } = run('Bearer crs_abc');
    await expect(result).resolves.toBe(true);
    expect(request.principal).toBe(principal);
    expect(localVerify).toHaveBeenCalledWith('crs_abc');
    expect(verify).not.toHaveBeenCalled();
  });

  it('неизвестная или просроченная сессия даёт 401', async () => {
    const { run } = setup(ADMIN_TOKEN);
    await expect(run('Bearer crs_unknown').result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('токен без префикса идёт в проверку JWT, а не в таблицу сессий', async () => {
    const { run, verify, localVerify } = setup(undefined);
    await expect(run('Bearer eyJ.x.y').result).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledWith('eyJ.x.y');
    expect(localVerify).not.toHaveBeenCalled();
  });
});

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
