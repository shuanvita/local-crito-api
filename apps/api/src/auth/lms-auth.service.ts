import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../common/prisma.service.js';
import type { Principal } from './auth.types.js';
import { normalizeEmail, toGrants } from './local-auth.service.js';

/** Заголовки, которые nginx копирует из ответа `auth_request` LMS. Значения LMS кодирует `rawurlencode`. */
export const LMS_SECRET_HEADER = 'x-cms-secret';
const USER_ID_HEADER = 'x-cms-user-id';
const LOGIN_HEADER = 'x-cms-user-login';
const NAME_HEADER = 'x-cms-user-name';
const ROLE_HEADER = 'x-cms-user-role';
const GROUPS_HEADER = 'x-cms-user-groups';

const MAX_GROUPS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Значение заголовка после `rawurlencode`; `null`, если заголовка нет или кодировка битая. */
function decodeHeader(headers: IncomingHttpHeaders, name: string): string | null {
  const raw = headers[name];
  if (typeof raw !== 'string') return null;
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === 'P2002';

interface LmsIdentity {
  id: string;
  email: string;
  name: string | null;
  role: string;
  groups: string[];
}

/**
 * Сквозной вход из LMS: nginx проверяет пользователя через `auth_request` и передаёт его в заголовках.
 * Заголовкам верим только вместе с общим секретом (`LMS_TRUST_SECRET`): API не должен быть доступен в обход nginx,
 * а секрет не даёт подделать пользователя тому, кто до него всё же дотянулся. Группы и роль приходят с каждым
 * запросом, поэтому права пересчитываются каждый раз и отзыв доступа в LMS действует сразу.
 */
@Injectable()
export class LmsAuthService {
  private readonly secretHash?: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('LMS_TRUST_SECRET')?.trim();
    if (secret) this.secretHash = sha256(secret);
  }

  /** Запрос объявляет себя запросом от LMS: тогда он проходит только проверку секрета, а не другие способы входа. */
  carriesLmsHeaders(headers: IncomingHttpHeaders): boolean {
    return headers[LMS_SECRET_HEADER] !== undefined;
  }

  /** Принципал по заголовкам или `null` (неверный секрет, неполные заголовки, заблокированный пользователь). */
  async authenticate(headers: IncomingHttpHeaders): Promise<Principal | null> {
    const secret = headers[LMS_SECRET_HEADER];
    if (!this.secretHash || typeof secret !== 'string' || !timingSafeEqual(this.secretHash, sha256(secret))) {
      return null;
    }
    const identity = this.parse(headers);
    if (!identity) return null;

    const user = await this.ensureUser(identity);
    if (!user.active) return null;
    await this.syncGrants(user.id, identity);

    const grants = await this.prisma.userGrant.findMany({
      where: { userId: user.id },
      include: { project: { select: { slug: true } } },
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      isSuperAdmin: user.isSuperAdmin,
      grants: toGrants(grants),
      viaLms: true,
    };
  }

  private parse(headers: IncomingHttpHeaders): LmsIdentity | null {
    const id = decodeHeader(headers, USER_ID_HEADER);
    const login = decodeHeader(headers, LOGIN_HEADER);
    const name = decodeHeader(headers, NAME_HEADER);
    const role = decodeHeader(headers, ROLE_HEADER);
    const groups = decodeHeader(headers, GROUPS_HEADER);
    if (!id || id.length > 128 || !login || login.length > 254 || !EMAIL_PATTERN.test(login)) return null;
    // Роли и групп может не быть (пользователь без проектов): тогда он войдёт, но не увидит ни одного проекта.
    if (role === null && headers[ROLE_HEADER] !== undefined) return null;
    if (groups === null && headers[GROUPS_HEADER] !== undefined) return null;
    const groupIds = [...new Set((groups ?? '').split(',').map((group) => group.trim()).filter(Boolean))];
    if (groupIds.length > MAX_GROUPS || groupIds.some((group) => group.length > 128)) return null;
    return {
      id,
      email: normalizeEmail(login),
      name: name ? name.slice(0, 200) : null,
      role: (role ?? '').toLowerCase().slice(0, 64),
      groups: groupIds,
    };
  }

  /**
   * Пользователь LMS по `externalId`. Локальную учётку с той же почтой (например, первого администратора,
   * созданного `npm run user:create`) присоединяем к LMS: флаг суперадмина и пароль-запас остаются.
   * Почта приходит из доверенного nginx.
   */
  private async ensureUser(identity: LmsIdentity) {
    const externalId = `lms:${identity.id}`;
    let user = await this.prisma.user.findUnique({ where: { externalId } });
    if (!user) {
      const local = await this.prisma.user.findUnique({ where: { loginEmail: identity.email } });
      try {
        user =
          local && local.externalId.startsWith('local:')
            ? await this.prisma.user.update({ where: { id: local.id }, data: { externalId } })
            : await this.prisma.user.create({
                data: { externalId, email: identity.email, name: identity.name },
              });
      } catch (error) {
        // Параллельный первый запрос того же пользователя успел раньше.
        if (!isUniqueViolation(error)) throw error;
        user = await this.prisma.user.findUniqueOrThrow({ where: { externalId } });
      }
    }
    const nameChanged = identity.name !== null && identity.name !== user.name;
    if (user.email !== identity.email || nameChanged) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { email: identity.email, ...(nameChanged ? { name: identity.name } : {}) },
      });
    }
    return user;
  }

  /** Заменяет права `source=lms` на вычисленные из групп и роли; пишет в БД, только если набор изменился. */
  private async syncGrants(userId: string, identity: LmsIdentity) {
    const desired = new Map<string, { scope: string; pageIds: string[]; requests: boolean }>();
    if (identity.groups.length > 0 && identity.role) {
      const links = await this.prisma.projectLmsGroup.findMany({
        where: { groupId: { in: identity.groups } },
        select: { projectId: true },
      });
      const projectIds = [...new Set(links.map((link) => link.projectId))];
      const roles = await this.prisma.projectLmsRole.findMany({
        where: { projectId: { in: projectIds }, role: identity.role },
      });
      for (const role of roles) {
        desired.set(role.projectId, {
          scope: role.scope,
          pageIds: role.scope === 'pages' ? [...role.pageIds].sort() : [],
          requests: role.requests,
        });
      }
    }

    const current = await this.prisma.userGrant.findMany({ where: { userId, source: 'lms' } });
    const same =
      current.length === desired.size &&
      current.every((grant) => {
        const want = desired.get(grant.projectId);
        return (
          want !== undefined &&
          want.scope === grant.scope &&
          want.requests === grant.requests &&
          want.pageIds.join() === [...grant.pageIds].sort().join()
        );
      });
    if (same) return;

    try {
      await this.prisma.$transaction([
        this.prisma.userGrant.deleteMany({ where: { userId, source: 'lms' } }),
        this.prisma.userGrant.createMany({
          data: [...desired].map(([projectId, grant]) => ({ userId, source: 'lms', projectId, ...grant })),
        }),
      ]);
    } catch (error) {
      // Параллельный запрос записал тот же набор: повторять не нужно.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}
