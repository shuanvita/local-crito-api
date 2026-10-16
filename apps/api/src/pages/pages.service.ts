import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { normalizeSlug } from '../common/slug.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Page } from '../generated/prisma/client.js';
import { ManifestService } from '../manifest/manifest.service.js';
import type { PageBlockInput } from '../manifest/manifest.service.js';
import type { PageDraft } from '@crito/contract';
import { CreatePageDto, UpdatePageDto } from './pages.dto.js';
import { RevalidateService } from './revalidate.service.js';

type PageContent = Pick<CreatePageDto, 'blocks' | 'meta' | 'headerConfig' | 'header' | 'noFooterSpacing'>;

/** Содержимое страницы одним JSON: так лежит черновик и так сравнивается с опубликованным. */
type StoredContent = Pick<PageDraft, 'blocks' | 'meta' | 'headerConfig' | 'header' | 'noFooterSpacing'>;

type PageRow = Page & {
  project?: unknown;
  draftBy?: { email: string; name: string | null } | null;
};

/**
 * Страницы проекта. Правки сначала сохраняются как черновик (`draft`), на сайт и в историю они попадают только
 * при публикации: тогда растёт `version` и создаётся `PageRevision`.
 * Удаление мягкое: страница уходит в корзину (`deletedAt`), пропадает с сайта и из списков,
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
    return this.toDetail(page);
  }

  async create(principal: Principal, projectSlug: string, dto: CreatePageDto) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const slug = normalizeSlug(dto.slug);
    await this.manifest.validateBlocks(projectSlug, dto.blocks);
    dto = {
      ...dto,
      blocks: await this.manifest.sanitizeBlocks(projectSlug, dto.blocks),
      header: await this.manifest.prepareHeader(projectSlug, dto.header),
    };

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
    return this.toDetail(page);
  }

  /**
   * Сохраняет правки как черновик: версия не растёт, история и сайт не меняются.
   * Если содержимое совпало с опубликованным, черновик снимается (нечего публиковать).
   */
  async update(principal: Principal, projectSlug: string, id: string, dto: UpdatePageDto) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const existing = await this.findPage(projectSlug, id);
    if (existing.deletedAt) {
      throw new ConflictException('Страница в корзине: сначала восстановите её');
    }
    await this.manifest.validateBlocks(projectSlug, dto.blocks);
    if (!this.access.hasFullProjectAccess(principal, projectSlug)) {
      // Сравниваем с тем, что редактор видел при открытии: с черновиком, если он есть.
      const base = (existing.draft ? this.draftContent(existing) : this.publishedContent(existing)).blocks;
      await this.assertReadonlyBlocksUnchanged(projectSlug, base as unknown as PageBlockInput[], dto.blocks);
    }
    dto = {
      ...dto,
      blocks: await this.manifest.sanitizeBlocks(projectSlug, dto.blocks),
      header: await this.manifest.prepareHeader(projectSlug, dto.header),
    };

    const content = this.snapshot(dto);
    const same = isDeepStrictEqual(content, this.publishedContent(existing));

    // Оптимистичная блокировка: черновик пишется, только если опубликованную версию не обогнали
    // и страницу за это время не удалили.
    const { count } = await this.prisma.page.updateMany({
      where: { id, version: dto.version, deletedAt: null },
      data: same
        ? { draft: Prisma.DbNull, draftUpdatedAt: null, draftById: null }
        : {
            draft: content as unknown as Prisma.InputJsonValue,
            draftUpdatedAt: new Date(),
            draftById: principal.userId,
          },
    });
    if (count === 0) {
      throw new ConflictException('Страница опубликована другим пользователем или удалена, обновите её');
    }
    return this.toDetail(await this.findPage(projectSlug, id));
  }

  /** Публикация: черновик становится опубликованной версией, версия растёт, снимок уходит в историю, кэш сайта сбрасывается. */
  async publish(principal: Principal, projectSlug: string, id: string, version: number) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const existing = await this.findPage(projectSlug, id);
    if (existing.deletedAt) {
      throw new ConflictException('Страница в корзине: сначала восстановите её');
    }
    if (!existing.draft) throw new ConflictException('Нет изменений для публикации');

    // Манифест мог измениться после сохранения черновика: проверяем и очищаем заново.
    const draft = this.draftContent(existing);
    await this.manifest.validateBlocks(projectSlug, draft.blocks);
    const blocks = await this.manifest.sanitizeBlocks(projectSlug, draft.blocks);
    const header = await this.manifest.prepareHeader(projectSlug, draft.header);
    const content = {
      ...this.contentData({
        ...draft,
        meta: draft.meta ?? undefined,
        headerConfig: draft.headerConfig ?? undefined,
        header,
        blocks,
      }),
    };

    await this.prisma.$transaction(async (tx) => {
      // Версия не должна измениться, а черновик не должен смениться между чтением и публикацией.
      const { count } = await tx.page.updateMany({
        where: { id, version, deletedAt: null, draftUpdatedAt: existing.draftUpdatedAt },
        data: {
          version: { increment: 1 },
          updatedById: principal.userId,
          ...content,
          draft: Prisma.DbNull,
          draftUpdatedAt: null,
          draftById: null,
        },
      });
      if (count === 0) {
        throw new ConflictException('Страница изменена другим пользователем или удалена, обновите её');
      }
      const saved = await tx.page.findUniqueOrThrow({ where: { id }, select: { version: true } });
      await tx.pageRevision.create({
        data: { pageId: id, version: saved.version, authorId: principal.userId, ...content },
      });
    });

    this.revalidate.notify(existing.project);
    return this.toDetail(await this.findPage(projectSlug, id));
  }

  /** Сохранить и сразу опубликовать (импорт контента). Если содержимое не изменилось, версия не растёт. */
  async updateAndPublish(principal: Principal, projectSlug: string, id: string, dto: UpdatePageDto) {
    const saved = await this.update(principal, projectSlug, id, dto);
    return saved.draft ? this.publish(principal, projectSlug, id, saved.version) : saved;
  }

  /** Отбрасывает черновик: редактор возвращается к опубликованной версии. */
  async discardDraft(principal: Principal, projectSlug: string, id: string) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const existing = await this.findPage(projectSlug, id);
    if (existing.deletedAt) {
      throw new ConflictException('Страница в корзине: сначала восстановите её');
    }
    await this.prisma.page.updateMany({
      where: { id },
      data: { draft: Prisma.DbNull, draftUpdatedAt: null, draftById: null },
    });
    return this.toDetail(await this.findPage(projectSlug, id));
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
    return this.toDetail(await this.findPage(projectSlug, id));
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

  /** Содержимое опубликованной версии: админка показывает его в предпросмотре и открывает в редакторе. */
  async revision(principal: Principal, projectSlug: string, id: string, version: number) {
    this.access.assertCanEditPage(principal, projectSlug, id);
    const page = await this.findPage(projectSlug, id);
    this.assertVisible(principal, projectSlug, page);
    const revision = await this.prisma.pageRevision.findUnique({
      where: { pageId_version: { pageId: id, version } },
      include: { author: { select: { email: true, name: true } } },
    });
    if (!revision) throw new NotFoundException('Версия не найдена');
    return {
      version: revision.version,
      createdAt: revision.createdAt,
      author: revision.author,
      blocks: revision.blocks as unknown as StoredContent['blocks'],
      meta: (revision.meta ?? null) as StoredContent['meta'],
      headerConfig: revision.headerConfig,
      header: (revision.header ?? null) as StoredContent['header'],
      noFooterSpacing: revision.noFooterSpacing,
    };
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

  /** Содержимое в виде, пригодном для хранения в черновике и для сравнения (без классов DTO и undefined). */
  private snapshot(dto: PageContent): StoredContent {
    return JSON.parse(
      JSON.stringify({
        blocks: dto.blocks,
        meta: dto.meta ?? null,
        headerConfig: dto.headerConfig ?? null,
        header: dto.header ?? null,
        noFooterSpacing: dto.noFooterSpacing ?? false,
      }),
    ) as StoredContent;
  }

  private publishedContent(page: Page): StoredContent {
    return {
      blocks: page.blocks as unknown as StoredContent['blocks'],
      meta: (page.meta ?? null) as StoredContent['meta'],
      headerConfig: page.headerConfig,
      header: (page.header ?? null) as StoredContent['header'],
      noFooterSpacing: page.noFooterSpacing,
    };
  }

  /** Черновики, сохранённые до появления шапки, не содержат `header`: считаем его пустым. */
  private draftContent(page: Page): StoredContent {
    const draft = page.draft as unknown as StoredContent;
    return { ...draft, header: draft.header ?? null };
  }

  /** Ответ API: опубликованное содержимое и черновик отдельным полем; служебные связи наружу не уходят. */
  private toDetail(page: PageRow) {
    const { project: _project, draft, draftUpdatedAt, draftById: _draftById, draftBy, ...rest } = page;
    return {
      ...rest,
      draft:
        draft && draftUpdatedAt
          ? { ...this.draftContent(page), updatedAt: draftUpdatedAt, author: draftBy ?? null }
          : null,
    };
  }

  private contentData(dto: PageContent) {
    return {
      blocks: dto.blocks as unknown as Prisma.InputJsonValue,
      meta: (dto.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      headerConfig: dto.headerConfig ?? null,
      // DbNull, а не undefined: при публикации убранная шапка должна стереть прежнюю, а не остаться.
      header: (dto.header ?? Prisma.DbNull) as Prisma.InputJsonValue,
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
      include: {
        project: { select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true } },
        draftBy: { select: { email: true, name: true } },
      },
    });
    if (!page) throw new NotFoundException('Страница не найдена');
    return page;
  }
}
