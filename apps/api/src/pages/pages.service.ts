import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { normalizeSlug } from '../common/slug.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ManifestService } from '../manifest/manifest.service.js';
import type { PageBlockInput } from '../manifest/manifest.service.js';
import { CreatePageDto, UpdatePageDto } from './pages.dto.js';
import { RevalidateService } from './revalidate.service.js';

type PageContent = Pick<CreatePageDto, 'blocks' | 'meta' | 'headerConfig' | 'noFooterSpacing'>;

/**
 * Страницы проекта. Удаление мягкое: страница уходит в корзину (`deletedAt`), пропадает с сайта и из списков,
 * но хранится вместе с историей. Из корзины её можно восстановить или удалить навсегда (оба действия и просмотр
 * корзины требуют доступа ко всему проекту). Адрес остаётся занятым, пока страница в корзине.
 */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly manifest: ManifestService,
    private readonly revalidate: RevalidateService,
  ) {}

  /** Список страниц проекта (без корзины); для ограниченного доступа только назначенные страницы. */
  async list(principal: Principal, projectSlug: string) {
    this.access.assertProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const allowed = this.access.allowedPageIds(principal, projectSlug);
    return this.prisma.page.findMany({
      where: { projectId: project.id, deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, slug: true, version: true, meta: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    });
  }

  /** Корзина: удалённые страницы, сначала недавно удалённые. */
  async listTrash(principal: Principal, projectSlug: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const pages = await this.prisma.page.findMany({
      where: { projectId: project.id, deletedAt: { not: null } },
      select: {
        id: true,
        slug: true,
        version: true,
        meta: true,
        updatedAt: true,
        deletedAt: true,
        deletedBy: { select: { email: true, name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });
    // Фильтр `not: null` в запросе уже гарантирует дату; сужаем тип для контракта.
    return pages.map((page) => ({ ...page, deletedAt: page.deletedAt as Date }));
  }

  async get(principal: Principal, projectSlug: string, id: string) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const page = await this.findPage(projectSlug, id);
    this.assertVisible(principal, projectSlug, page);
    return page;
  }

  async create(principal: Principal, projectSlug: string, dto: CreatePageDto) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const slug = normalizeSlug(dto.slug);
    await this.manifest.validateBlocks(projectSlug, dto.blocks);
    dto = { ...dto, blocks: await this.manifest.sanitizeBlocks(projectSlug, dto.blocks) };

    const exists = await this.prisma.page.findUnique({
      where: { projectId_slug: { projectId: project.id, slug } },
      select: { deletedAt: true },
    });
    if (exists) {
      throw new ConflictException(
        exists.deletedAt
          ? `Страница ${slug} находится в корзине: восстановите её или удалите навсегда`
          : `Страница ${slug} уже существует`,
      );
    }

    const page = await this.prisma.page.create({
      data: {
        projectId: project.id,
        slug,
        updatedById: principal.userId,
        ...this.contentData(dto),
        revisions: { create: { version: 1, authorId: principal.userId, ...this.contentData(dto) } },
      },
    });
    this.revalidate.notify(project);
    return page;
  }

  /** Сохранение = публикация: версия повышается, снимок уходит в историю, кэш сайта сбрасывается. */
  async update(principal: Principal, projectSlug: string, id: string, dto: UpdatePageDto) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const existing = await this.findPage(projectSlug, id);
    if (existing.deletedAt) {
      throw new ConflictException('Страница в корзине: сначала восстановите её');
    }
    await this.manifest.validateBlocks(projectSlug, dto.blocks);
    if (!this.access.hasFullProjectAccess(principal, projectSlug)) {
      await this.assertReadonlyBlocksUnchanged(projectSlug, existing.blocks as unknown as PageBlockInput[], dto.blocks);
    }
    dto = { ...dto, blocks: await this.manifest.sanitizeBlocks(projectSlug, dto.blocks) };

    const page = await this.prisma.$transaction(async (tx) => {
      // Оптимистичная блокировка: обновляем только если версия не изменилась с момента открытия
      // и страницу за это время не удалили.
      const { count } = await tx.page.updateMany({
        where: { id, version: dto.version, deletedAt: null },
        data: {
          version: { increment: 1 },
          updatedById: principal.userId,
          ...this.contentData(dto),
        },
      });
      if (count === 0) {
        throw new ConflictException('Страница изменена другим пользователем или удалена, обновите её');
      }
      const saved = await tx.page.findUniqueOrThrow({ where: { id } });
      await tx.pageRevision.create({
        data: { pageId: id, version: saved.version, authorId: principal.userId, ...this.contentData(dto) },
      });
      return saved;
    });

    this.revalidate.notify(existing.project);
    return page;
  }

  /** Мягкое удаление: страница уходит в корзину, пропадает с сайта, история сохраняется. */
  async remove(principal: Principal, projectSlug: string, id: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const page = await this.findPage(projectSlug, id);
    const { count } = await this.prisma.page.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: principal.userId },
    });
    // Уже в корзине: для списка живых страниц её нет.
    if (count === 0) throw new NotFoundException('Страница не найдена');
    this.revalidate.notify(page.project);
  }

  /** Возвращает страницу из корзины на сайт в том состоянии, в каком её удалили. */
  async restoreFromTrash(principal: Principal, projectSlug: string, id: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const page = await this.findPage(projectSlug, id);
    const { count } = await this.prisma.page.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    });
    if (count === 0) throw new ConflictException('Страница не в корзине');
    this.revalidate.notify(page.project);
    return this.prisma.page.findUniqueOrThrow({ where: { id } });
  }

  /** Окончательное удаление страницы из корзины вместе с историей версий. Необратимо. */
  async purge(principal: Principal, projectSlug: string, id: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    await this.findPage(projectSlug, id);
    const { count } = await this.prisma.page.deleteMany({ where: { id, deletedAt: { not: null } } });
    if (count === 0) throw new ConflictException('Сначала переместите страницу в корзину');
  }

  async revisions(principal: Principal, projectSlug: string, id: string) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const page = await this.findPage(projectSlug, id);
    this.assertVisible(principal, projectSlug, page);
    return this.prisma.pageRevision.findMany({
      where: { pageId: id },
      select: { version: true, createdAt: true, author: { select: { email: true, name: true } } },
      orderBy: { version: 'desc' },
    });
  }

  /** Откат: содержимое старой ревизии сохраняется как новая версия, история не переписывается. */
  async restoreRevision(principal: Principal, projectSlug: string, id: string, version: number) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const page = await this.findPage(projectSlug, id);
    const revision = await this.prisma.pageRevision.findUnique({
      where: { pageId_version: { pageId: id, version } },
    });
    if (!revision) throw new NotFoundException('Ревизия не найдена');

    return this.update(principal, projectSlug, id, {
      version: page.version,
      blocks: revision.blocks as unknown as UpdatePageDto['blocks'],
      meta: (revision.meta as UpdatePageDto['meta']) ?? undefined,
      headerConfig: revision.headerConfig ?? undefined,
      noFooterSpacing: revision.noFooterSpacing,
    });
  }

  /** Удалённую страницу видит только тот, у кого есть доступ ко всему проекту (для просмотра истории в корзине). */
  private assertVisible(principal: Principal, projectSlug: string, page: { deletedAt: Date | null }) {
    if (page.deletedAt && !this.access.hasFullProjectAccess(principal, projectSlug)) {
      throw new NotFoundException('Страница не найдена');
    }
  }

  /**
   * У блоков без схемы сервер не знает, какие поля содержат HTML или адреса, поэтому очистить их не может.
   * Редактор с доступом только к отдельным страницам не должен менять такие данные: админка их и не меняет.
   * Для новых блоков допустимо только пустое содержимое.
   */
  private async assertReadonlyBlocksUnchanged(
    projectSlug: string,
    previous: PageBlockInput[],
    next: PageBlockInput[],
  ) {
    const readonly = await this.manifest.readonlyTypes(projectSlug);
    const before = new Map(previous.map((block) => [block.id, block]));

    for (const block of next) {
      if (!readonly.has(block.type)) continue;
      const old = before.get(block.id);
      const unchanged = old
        ? old.type === block.type && isDeepStrictEqual(old.data, block.data)
        : isDeepStrictEqual(block.data, {});
      if (!unchanged) {
        throw new ForbiddenException(
          `Содержимое блока "${block.type}" нельзя менять: у него нет схемы, правка доступна только при доступе ко всему проекту`,
        );
      }
    }
  }

  private contentData(dto: PageContent) {
    return {
      blocks: dto.blocks as unknown as Prisma.InputJsonValue,
      meta: (dto.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      headerConfig: dto.headerConfig ?? null,
      noFooterSpacing: dto.noFooterSpacing ?? false,
    };
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }

  /** Находит страницу проекта, в том числе из корзины: вызывающий сам решает, что с ней делать. */
  private async findPage(projectSlug: string, id: string) {
    const page = await this.prisma.page.findFirst({
      where: { id, project: { slug: projectSlug } },
      include: { project: { select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true } } },
    });
    if (!page) throw new NotFoundException('Страница не найдена');
    return page;
  }
}
