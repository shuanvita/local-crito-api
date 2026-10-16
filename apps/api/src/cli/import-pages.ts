import type { CreatePageRequest, ExportFile } from '@crito/contract';
import type { Principal } from '../auth/auth.types.js';
import { normalizeSlug } from '../common/slug.js';
import type { CreatePageDto } from '../pages/pages.dto.js';

/** Страница и файл экспорта: формат из контракта (scripts/rucode/export.mjs). */
export type ExportedPage = CreatePageRequest;
export type { ExportFile };

export interface ImportOptions {
  project: string;
  /** Только проверить: ничего не записывать. */
  dryRun: boolean;
  /** Обновить уже существующие страницы (новая версия), а не пропускать их. */
  overwrite: boolean;
}

/** Зависимости импорта: реальные сервисы или подставные в тестах. */
export interface ImportDeps {
  principal: Principal;
  findPage(project: string, slug: string): Promise<{ id: string; version: number; deleted?: boolean } | null>;
  validateBlocks(project: string, blocks: CreatePageDto['blocks']): Promise<void>;
  create(principal: Principal, project: string, dto: CreatePageDto): Promise<unknown>;
  update(
    principal: Principal,
    project: string,
    id: string,
    dto: CreatePageDto & { version: number },
  ): Promise<unknown>;
}

export type ImportStatus = 'created' | 'updated' | 'skipped' | 'valid' | 'failed';

export interface ImportResult {
  slug: string;
  status: ImportStatus;
  message?: string;
}

/** Ошибки валидации Nest лежат в `response.errors`: показываем их целиком, а не только общее сообщение. */
function describeError(error: unknown): string {
  const response = (error as { response?: { message?: string; errors?: string[] } }).response;
  if (response?.errors?.length) return [response.message, ...response.errors].filter(Boolean).join('; ');
  return error instanceof Error ? error.message : String(error);
}

/**
 * Импортирует страницы в CMS. Каждая страница проверяется по манифесту проекта теми же правилами,
 * что и при сохранении из админки. Ошибка одной страницы не прерывает остальные.
 */
export async function importPages(
  deps: ImportDeps,
  data: ExportFile,
  options: ImportOptions,
): Promise<ImportResult[]> {
  if (data.project !== options.project) {
    throw new Error(`Файл относится к проекту "${data.project}", а импорт запущен для "${options.project}"`);
  }

  const results: ImportResult[] = [];
  for (const page of data.pages) {
    let slug = page.slug;
    try {
      slug = normalizeSlug(page.slug);
      const dto: CreatePageDto = {
        slug,
        blocks: page.blocks,
        meta: page.meta,
        header: page.header,
        noFooterSpacing: page.noFooterSpacing ?? false,
      };
      const existing = await deps.findPage(options.project, slug);

      // Страница в корзине занимает адрес: импорт её не трогает, решать надо вручную.
      if (existing?.deleted) {
        results.push({ slug, status: 'skipped', message: 'в корзине: восстановите страницу или удалите её навсегда' });
        continue;
      }

      if (existing && !options.overwrite) {
        results.push({ slug, status: 'skipped', message: `уже есть (версия ${existing.version}); для обновления используйте --overwrite` });
        continue;
      }

      await deps.validateBlocks(options.project, dto.blocks);
      if (options.dryRun) {
        results.push({ slug, status: 'valid', message: existing ? 'будет обновлена' : 'будет создана' });
        continue;
      }

      if (existing) {
        await deps.update(deps.principal, options.project, existing.id, { ...dto, version: existing.version });
        results.push({ slug, status: 'updated' });
      } else {
        await deps.create(deps.principal, options.project, dto);
        results.push({ slug, status: 'created' });
      }
    } catch (error) {
      results.push({ slug, status: 'failed', message: describeError(error) });
    }
  }
  return results;
}
