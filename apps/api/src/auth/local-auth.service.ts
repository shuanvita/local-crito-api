import type { Grant } from '@crito/contract';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service.js';
import type { Principal } from './auth.types.js';
import { PasswordService } from './password.service.js';

/** Префикс отличает токен сессии от JWT и от `ADMIN_TOKEN`: guard не ходит в БД за чужими токенами. */
export const SESSION_TOKEN_PREFIX = 'crs_';
/** Простой дольше этого срока обрывает сессию. */
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** Безусловный предел жизни сессии, как бы часто ей ни пользовались. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** `lastUsedAt` пишется не чаще раза в минуту: не писать в БД на каждый запрос. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** Лимит неудачных попыток входа: по почте (защита аккаунта) и по IP (защита от перебора многих почт). */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 40;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Права из БД в формат контракта. */
export function toGrants(
  rows: Array<{ scope: string; pageIds: string[]; project: { slug: string } }>,
): Grant[] {
  return rows.map((row) =>
    row.scope === 'pages'
      ? { project: row.project.slug, scope: 'pages', pageIds: row.pageIds }
      : { project: row.project.slug, scope: 'project' },
  );
}

@Injectable()
export class LocalAuthService {
  /** Время неудачных попыток по ключу (`email:…` / `ip:…`): в памяти процесса, при перезапуске обнуляется. */
  private readonly fails = new Map<string, number[]>();
  /** Хэш несуществующего пользователя: чтобы вход по неизвестной почте занимал столько же времени. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Проверяет пароль и открывает сессию. Причину отказа (нет пользователя, блокировка, пароль) не раскрываем. */
  async login(email: string, password: string, ip: string | undefined) {
    const loginEmail = normalizeEmail(email);
    const emailKey = `email:${loginEmail}`;
    const ipKey = ip ? `ip:${ip}` : undefined;
    this.assertNotLimited(emailKey, MAX_FAILS_PER_EMAIL);
    if (ipKey) this.assertNotLimited(ipKey, MAX_FAILS_PER_IP);

    const user = await this.prisma.user.findUnique({ where: { loginEmail } });
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const passwordOk = await this.passwords.verify(password, hash);
    if (!user || !user.passwordHash || !user.active || !passwordOk) {
      this.recordFail(emailKey);
      if (ipKey) this.recordFail(ipKey);
      throw new UnauthorizedException('Неверная почта или пароль');
    }
    this.fails.delete(emailKey);

    await this.deleteExpired();
    const token = SESSION_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = new Date(now + MAX_AGE_MS);
    await this.prisma.session.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt, lastUsedAt: new Date(now) },
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Принципал по токену сессии или `null`. Пользователь и права читаются из БД на каждый запрос,
   * поэтому блокировка и смена прав действуют сразу.
   */
  async verify(token: string): Promise<Principal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { grants: { include: { project: { select: { slug: true } } } } } } },
    });
    if (!session) return null;
    const now = Date.now();
    const { user } = session;
    const expired = session.expiresAt.getTime() <= now || now - session.lastUsedAt.getTime() > IDLE_TIMEOUT_MS;
    if (expired || !user.active) {
      if (expired) await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (now - session.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } });
    }
    return {
      userId: user.id,
      email: user.email,
      name: user.name ?? undefined,
      isSuperAdmin: user.isSuperAdmin,
      grants: toGrants(user.grants),
      sessionId: session.id,
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /** Обрывает все сессии пользователя, кроме `exceptSessionId`. */
  async revokeSessions(userId: string, exceptSessionId?: string) {
    await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    });
  }

  private deleteExpired() {
    const now = Date.now();
    return this.prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lte: new Date(now) } }, { lastUsedAt: { lt: new Date(now - IDLE_TIMEOUT_MS) } }],
      },
    });
  }

  private getDummyHash() {
    this.dummyHash ??= this.passwords.hash(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }

  private recent(key: string): number[] {
    const now = Date.now();
    const times = (this.fails.get(key) ?? []).filter((time) => now - time < FAIL_WINDOW_MS);
    if (times.length > 0) this.fails.set(key, times);
    else this.fails.delete(key);
    return times;
  }

  private assertNotLimited(key: string, max: number) {
    if (this.recent(key).length >= max) {
      throw new HttpException('Слишком много попыток входа, попробуйте позже', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordFail(key: string) {
    // Перебор множества почт не должен раздувать память: при разрастании карты чистим протухшие ключи.
    if (this.fails.size > 5000) for (const stale of this.fails.keys()) this.recent(stale);
    this.fails.set(key, [...this.recent(key), Date.now()]);
  }
}
