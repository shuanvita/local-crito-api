import type { ContentPage } from '@crito/contract';
import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../common/prisma.service.js';
import { tryNormalizeSlug } from '../common/slug.js';

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
        headerConfig: true,
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
      ...(page.headerConfig ? { headerConfig: page.headerConfig } : {}),
      noFooterSpacing: page.noFooterSpacing,
    };
  }
}
