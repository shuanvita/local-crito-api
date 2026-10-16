import type { ContentPage, PublicRegion } from '@crito/contract';
import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../common/prisma.service.js';
import { tryNormalizeSlug } from '../common/slug.js';

/** Регионы в порядке, заданном в админке: форма совпадает с `RegionOption` сайта. */
export function listPublicRegions(prisma: PrismaService): Promise<PublicRegion[]> {
  return prisma.region.findMany({
    select: { value: true, label: true },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
}

/**
 * Общие справочники: не принадлежат проекту, любой сайт читает их по одному адресу.
 * Регистрируется раньше `PublicController`, чтобы `dictionaries` не принимали за slug проекта.
 */
@ApiTags('public')
@Public()
@Controller('public/dictionaries')
export class PublicDictionariesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Массив `{ value, label }`; пустой справочник даёт `[]`. Кэш как у страниц: `no-cache` с проверкой `ETag`. */
  @Header('Cache-Control', 'public, no-cache')
  @Get('regions')
  regions(): Promise<PublicRegion[]> {
    return listPublicRegions(this.prisma);
  }
}

/**
 * Публичное чтение страниц сайтом. Формат ответа совпадает с `ContentPage` фронта
 * (`parseContentPage`): сайт задаёт `NUXT_CMS_BASE_URL=<api>/public/<project>`
 * и запрашивает `/pages/<slug>`.
 */
@ApiTags('public')
@Public()
@Controller('public/:project')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Устаревший адрес справочника регионов, оставлен, чтобы уже выложенные сайты не сломались.
   * Справочник общий для всех проектов: отдаёт то же, что `GET /public/dictionaries/regions`.
   * Неизвестный проект это 404 (как и у страниц).
   */
  @Header('Cache-Control', 'public, no-cache')
  @Get('dictionaries/regions')
  async getRegions(@Param('project') project: string): Promise<PublicRegion[]> {
    const found = await this.prisma.project.findUnique({ where: { slug: project }, select: { id: true } });
    if (!found) throw new NotFoundException('Проект не найден');
    return listPublicRegions(this.prisma);
  }

  // no-cache: кэши могут хранить ответ, но каждый раз сверяют ETag, поэтому публикация видна сразу.
  @Header('Cache-Control', 'public, no-cache')
  @Get('pages/*slug')
  async getPage(@Param('project') project: string, @Param('slug') slugParam: string | string[]): Promise<ContentPage> {
    // Любой адрес, который не может быть страницей (регистр, точки, пробелы, кириллица), это 404, а не 400:
    // сайт отвечает 502 на всё, кроме 404, и каждый сканер уронил бы страницы ошибкой и записью в лог.
    const slug = tryNormalizeSlug([slugParam].flat().join('/'));
    if (!slug) throw new NotFoundException('Страница не найдена');
    const page = await this.prisma.page.findFirst({
      where: { slug, deletedAt: null, project: { slug: project } },
      select: {
        slug: true,
        version: true,
        blocks: true,
        meta: true,
        header: true,
        footer: true,
        noFooterSpacing: true,
      },
    });
    if (!page) throw new NotFoundException('Страница не найдена');

    // Блоки и SEO в БД хранятся как JSON: их форму гарантирует проверка по манифесту при сохранении.
    return {
      slug: page.slug,
      version: page.version,
      blocks: page.blocks as unknown as ContentPage['blocks'],
      ...(page.meta ? { meta: page.meta as ContentPage['meta'] } : {}),
      ...(page.header ? { header: page.header as ContentPage['header'] } : {}),
      ...(page.footer ? { footer: page.footer as ContentPage['footer'] } : {}),
      noFooterSpacing: page.noFooterSpacing,
    };
  }
}
