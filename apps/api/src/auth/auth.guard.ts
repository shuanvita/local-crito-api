import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/prisma.service.js';
import { isDevelopment } from '../config/runtime.js';
import { IS_PUBLIC } from './public.decorator.js';
import { SessionService } from './session.service.js';
import type { AuthedRequest, Principal } from './auth.types.js';

/** Глобальный guard: всё закрыто, кроме эндпоинтов с @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly devBypass: boolean;
  private devPrincipal?: Promise<Principal>;

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.devBypass = config.get<string>('AUTH_DEV_BYPASS') === 'true';
    if (this.devBypass && !isDevelopment()) {
      throw new Error('AUTH_DEV_BYPASS разрешён только при NODE_ENV=development');
    }
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
    const principal = token ? await this.sessions.verify(token) : null;
    if (!principal) throw new UnauthorizedException();

    request.principal = principal;
    return true;
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
