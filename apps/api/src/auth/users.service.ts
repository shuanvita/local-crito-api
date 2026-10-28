import type { Grant, UserAccount } from '@crito/contract';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service.js';
import { AccessService } from './access.service.js';
import type { CreateUserDto, UpdateUserDto, UserGrantsDto } from './auth.dto.js';
import type { Principal } from './auth.types.js';
import { LocalAuthService, normalizeEmail, toGrants } from './local-auth.service.js';
import { PasswordService } from './password.service.js';

const include = { grants: { include: { project: { select: { slug: true } } } } } as const;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  active: boolean;
  passwordHash: string | null;
  createdAt: Date;
  grants: Array<{ scope: string; pageIds: string[]; project: { slug: string } }>;
};

/** Учётные записи и локальные права (до перехода на LMS). Всё только для суперадмина. */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly passwords: PasswordService,
    private readonly localAuth: LocalAuthService,
  ) {}

  async list(principal: Principal): Promise<UserAccount[]> {
    this.access.assertSuperAdmin(principal);
    const users = await this.prisma.user.findMany({
      where: { loginEmail: { not: null } },
      include,
      orderBy: { email: 'asc' },
    });
    return users.map(toAccount);
  }

  async create(principal: Principal, dto: CreateUserDto): Promise<UserAccount> {
    this.access.assertSuperAdmin(principal);
    const loginEmail = normalizeEmail(dto.email);
    if (await this.prisma.user.findUnique({ where: { loginEmail } })) {
      throw new ConflictException('Пользователь с такой почтой уже есть');
    }
    const user = await this.prisma.user.create({
      data: {
        externalId: `local:${randomUUID()}`,
        email: loginEmail,
        loginEmail,
        name: dto.name?.trim() || null,
        passwordHash: await this.passwords.hash(dto.password),
        isSuperAdmin: dto.isSuperAdmin ?? false,
      },
      include,
    });
    return toAccount(user);
  }

  async update(principal: Principal, id: string, dto: UpdateUserDto): Promise<UserAccount> {
    this.access.assertSuperAdmin(principal);
    const user = await this.find(id);
    if (dto.active === false && id === principal.userId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }
    const losesAdmin = (dto.active === false || dto.isSuperAdmin === false) && user.isSuperAdmin && user.active;
    // Проверка и запись в одной транзакции: два одновременных запроса не оставят систему без администратора.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (losesAdmin) {
        const others = await tx.user.count({
          where: { isSuperAdmin: true, active: true, loginEmail: { not: null }, id: { not: id } },
        });
        if (others === 0) throw new BadRequestException('Нельзя лишить прав последнего администратора');
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}),
          ...(dto.isSuperAdmin !== undefined ? { isSuperAdmin: dto.isSuperAdmin } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        include,
      });
    });
    // Сессии заблокированного отдельно не нужны (verify проверяет `active`), но убираем их, чтобы не копились.
    if (dto.active === false) await this.localAuth.revokeSessions(id);
    return toAccount(updated);
  }

  /** Новый пароль администратором; все сессии пользователя обрываются. */
  async resetPassword(principal: Principal, id: string, password: string): Promise<void> {
    this.access.assertSuperAdmin(principal);
    await this.find(id);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await this.passwords.hash(password) } });
    await this.localAuth.revokeSessions(id);
  }

  /** Заменяет локальные права пользователя. Пустой список снимает все. */
  async setGrants(principal: Principal, id: string, dto: UserGrantsDto): Promise<UserAccount> {
    this.access.assertSuperAdmin(principal);
    await this.find(id);
    const rows = await this.resolveGrants(dto.grants);
    await this.prisma.$transaction([
      this.prisma.userGrant.deleteMany({ where: { userId: id, source: 'local' } }),
      this.prisma.userGrant.createMany({
        data: rows.map((row) => ({ userId: id, source: 'local', ...row })),
      }),
    ]);
    return toAccount(await this.find(id));
  }

  /** Проверяет форму прав и существование проектов и страниц; возвращает строки для записи. */
  private async resolveGrants(grants: Grant[]) {
    const seen = new Set<string>();
    for (const grant of grants) {
      if (typeof grant !== 'object' || grant === null || typeof grant.project !== 'string') {
        throw new BadRequestException('Некорректное право');
      }
      if (seen.has(grant.project)) throw new BadRequestException(`Проект «${grant.project}» указан дважды`);
      seen.add(grant.project);
      if (grant.scope === 'pages') {
        const ids = (grant as { pageIds?: unknown }).pageIds;
        if (!Array.isArray(ids) || ids.length === 0 || !ids.every((value) => typeof value === 'string')) {
          throw new BadRequestException(`Для проекта «${grant.project}» выберите хотя бы одну страницу`);
        }
      } else if (grant.scope !== 'project') {
        throw new BadRequestException('Некорректная область права');
      }
    }

    const projects = await this.prisma.project.findMany({
      where: { slug: { in: [...seen] } },
      select: { id: true, slug: true },
    });
    const bySlug = new Map(projects.map((project) => [project.slug, project.id]));
    return Promise.all(
      grants.map(async (grant) => {
        const projectId = bySlug.get(grant.project);
        if (!projectId) throw new BadRequestException(`Проект «${grant.project}» не найден`);
        if (grant.scope === 'project') return { projectId, scope: 'project', pageIds: [] as string[] };
        const pageIds = [...new Set(grant.pageIds)];
        const found = await this.prisma.page.count({ where: { projectId, id: { in: pageIds } } });
        if (found !== pageIds.length) {
          throw new BadRequestException(`Не все страницы найдены в проекте «${grant.project}»`);
        }
        return { projectId, scope: 'pages', pageIds };
      }),
    );
  }

  private async find(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include });
    if (!user || !user.loginEmail) throw new NotFoundException('Пользователь не найден');
    return user;
  }
}

function toAccount(user: UserRow): UserAccount {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    active: user.active,
    hasPassword: user.passwordHash !== null,
    grants: toGrants(user.grants),
    createdAt: user.createdAt.toISOString(),
  };
}
