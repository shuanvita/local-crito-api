import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { REVALIDATE_SECRET_CONTEXT, SecretBox } from '../common/secret-box.js';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Поля проекта, безопасные для отдачи в админку (без секретов). */
const publicSelect = {
  id: true,
  slug: true,
  name: true,
  defaultLocale: true,
  revalidateUrl: true,
  manifestHash: true,
  createdAt: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly secrets: SecretBox,
  ) {}

  /** Проекты, к которым у пользователя есть доступ. */
  async list(principal: Principal) {
    const where = principal.isSuperAdmin
      ? {}
      : { slug: { in: [...new Set(principal.grants.map((grant) => grant.project))] } };
    const projects = await this.prisma.project.findMany({ where, select: publicSelect, orderBy: { name: 'asc' } });
    return Promise.all(projects.map((project) => this.withAccess(principal, project)));
  }

  async get(principal: Principal, slug: string) {
    this.access.assertProjectAccess(principal, slug);
    const project = await this.prisma.project.findUnique({ where: { slug }, select: publicSelect });
    if (!project) throw new NotFoundException('Проект не найден');
    return this.withAccess(principal, project);
  }

  /** Создаёт проект. Ключ CI показывается один раз, в БД хранится только его хеш. */
  async create(principal: Principal, dto: CreateProjectDto) {
    this.access.assertSuperAdmin(principal);
    if (await this.prisma.project.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException('Проект с таким slug уже есть');
    }
    const ciKey = randomBytes(32).toString('hex');
    const project = await this.prisma.project.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        defaultLocale: dto.defaultLocale,
        revalidateUrl: dto.revalidateUrl,
        revalidateSecret: this.encryptSecret(dto.revalidateSecret),
        ciKeyHash: hashKey(ciKey),
      },
      select: publicSelect,
    });
    return { project: await this.withAccess(principal, project), ciKey };
  }

  /** Меняет настройки проекта. Пустая строка в revalidateUrl или revalidateSecret очищает значение. */
  async update(principal: Principal, slug: string, dto: UpdateProjectDto) {
    this.access.assertSuperAdmin(principal);
    const { count } = await this.prisma.project.updateMany({
      where: { slug },
      data: {
        name: dto.name,
        defaultLocale: dto.defaultLocale,
        revalidateUrl: dto.revalidateUrl === undefined ? undefined : dto.revalidateUrl || null,
        revalidateSecret:
          dto.revalidateSecret === undefined ? undefined : (this.encryptSecret(dto.revalidateSecret) ?? null),
      },
    });
    if (count === 0) throw new NotFoundException('Проект не найден');
    return this.get(principal, slug);
  }

  async rotateCiKey(principal: Principal, slug: string) {
    this.access.assertSuperAdmin(principal);
    const ciKey = randomBytes(32).toString('hex');
    const { count } = await this.prisma.project.updateMany({
      where: { slug },
      data: { ciKeyHash: hashKey(ciKey) },
    });
    if (count === 0) throw new NotFoundException('Проект не найден');
    return { ciKey };
  }

  /**
   * Добавляет к проекту право текущего пользователя (интерфейс по нему скрывает недоступные действия)
   * и сводку для карточки на главной. Сводка считается по страницам, доступным пользователю: тот, кому
   * выдали несколько страниц, не узнаёт, сколько их всего в проекте и когда менялись остальные.
   */
  private async withAccess<T extends { id: string; slug: string }>(principal: Principal, project: T) {
    const allowed = this.access.allowedPageIds(principal, project.slug);
    const stats = await this.prisma.page.aggregate({
      where: { projectId: project.id, deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}) },
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    return {
      ...project,
      fullAccess: this.access.hasFullProjectAccess(principal, project.slug),
      pagesCount: stats._count._all,
      lastChangedAt: stats._max.updatedAt,
    };
  }

  private encryptSecret(secret: string | undefined): string | undefined {
    return secret ? this.secrets.encrypt(secret, REVALIDATE_SECRET_CONTEXT) : undefined;
  }
}
