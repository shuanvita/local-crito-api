import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma.service.js';
import { isDevelopment } from '../config/runtime.js';
import { IS_PUBLIC } from './public.decorator.js';
import { LocalAuthService, SESSION_TOKEN_PREFIX } from './local-auth.service.js';
import { SessionService } from './session.service.js';
import type { AuthedRequest, Principal } from './auth.types.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Глобальный guard: всё закрыто, кроме эндпоинтов с @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly devBypass: boolean;
  private devPrincipal?: Promise<Principal>;
  /** Хеш `ADMIN_TOKEN`: хеши одной длины сравниваются за постоянное время. */
  private readonly adminTokenHash?: Buffer;
  private adminPrincipal?: Promise<Principal>;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly localAuth: LocalAuthService,
    config: ConfigService,
  ) {
    this.devBypass = config.get<string>('AUTH_DEV_BYPASS') === 'true';
    if (this.devBypass && !isDevelopment()) {
      throw new Error('AUTH_DEV_BYPASS разрешён только при NODE_ENV=development');
    }
    const adminToken = config.get<string>('ADMIN_TOKEN')?.trim();
    if (adminToken) this.adminTokenHash = sha256(adminToken);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();

    if (this.devBypass) {
      this.devPrincipal ??= this.createDevPrincipal();
      request.principal = await this.devPrincipal;
      return true;
    }

    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token && this.isAdminToken(token)) {
      this.adminPrincipal ??= this.createAdminPrincipal();
      request.principal = await this.adminPrincipal;
      return true;
    }

    // Серверная сессия входа по паролю (токен с префиксом); иначе короткий JWT.
    const principal = !token
      ? null
      : token.startsWith(SESSION_TOKEN_PREFIX)
        ? await this.localAuth.verify(token)
        : await this.sessions.verify(token);
    if (!principal) throw new UnauthorizedException();

    request.principal = principal;
    return true;
  }

  /**
   * Служебный токен владельца (`ADMIN_TOKEN`) до появления входа через LMS. Его подставляет серверный прокси
   * админки, в браузер он не попадает; защита самой админки это nginx (basic auth) перед ней.
   */
  private isAdminToken(token: string): boolean {
    return this.adminTokenHash !== undefined && timingSafeEqual(this.adminTokenHash, sha256(token));
  }

  private async createAdminPrincipal(): Promise<Principal> {
    const user = await this.prisma.user.upsert({
      where: { externalId: 'admin-token' },
      create: { externalId: 'admin-token', email: 'admin@localhost', name: 'Администратор' },
      update: {},
    });
    return { userId: user.id, email: user.email, name: user.name ?? undefined, isSuperAdmin: true, grants: [] };
  }

  /** Локальный суперпользователь для разработки без LMS: заводим его запись, чтобы работали внешние ключи. */
  private async createDevPrincipal(): Promise<Principal> {
    const user = await this.prisma.user.upsert({
      where: { externalId: 'dev-user' },
      create: { externalId: 'dev-user', email: 'dev@localhost', name: 'Dev' },
      update: {},
    });
    return { userId: user.id, email: user.email, name: user.name ?? undefined, isSuperAdmin: true, grants: [] };
  }
}
