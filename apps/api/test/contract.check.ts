/**
 * Проверка соответствия API контракту `@crito/contract` на уровне типов (рантайм-кода здесь нет).
 * Выполняется командой `npm run typecheck`: если ответ сервиса перестал совпадать с контрактом,
 * проверка типов падает, и админка не получит данные не того формата.
 *
 * Сравнивается формат «по проводу»: даты сериализуются в строки (`Jsonify`).
 * Поля JSON (`blocks`, `meta`) Prisma типизирует как `JsonValue`, их форму гарантирует проверка
 * по манифесту при сохранении, поэтому в сравнении они исключены.
 */
import type {
  BlockManifest,
  CreateProjectResponse,
  MediaItem,
  PageDetail,
  PageListItem,
  PageRevisionItem,
  ProjectSummary,
  RegionItem,
  RotateCiKeyResponse,
  TrashedPageItem,
} from '@crito/contract';
import type { DictionariesService } from '../src/dictionaries/dictionaries.service.js';
import type { ManifestService } from '../src/manifest/manifest.service.js';
import type { MediaService } from '../src/media/media.service.js';
import type { PagesService } from '../src/pages/pages.service.js';
import type { ProjectsService } from '../src/projects/projects.service.js';

/** Тип значения после `JSON.stringify` / `JSON.parse`: даты становятся строками. */
type Jsonify<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

type Wire<T> = Jsonify<Awaited<T>>;
type WithoutJson<T> = Omit<T, 'blocks' | 'meta'>;
type Expect<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type ContractChecks = [
  // медиатека
  Expect<Extends<Wire<ReturnType<MediaService['upload']>>, MediaItem>>,
  Expect<Extends<Wire<ReturnType<MediaService['list']>>, MediaItem[]>>,
  // проекты
  Expect<Extends<Wire<ReturnType<ProjectsService['get']>>, ProjectSummary>>,
  Expect<Extends<Wire<ReturnType<ProjectsService['list']>>, ProjectSummary[]>>,
  Expect<Extends<Wire<ReturnType<ProjectsService['update']>>, ProjectSummary>>,
  Expect<Extends<Wire<ReturnType<ProjectsService['create']>>, CreateProjectResponse>>,
  Expect<Extends<Wire<ReturnType<ProjectsService['rotateCiKey']>>, RotateCiKeyResponse>>,
  // страницы
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['list']>>[number]>, WithoutJson<PageListItem>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['get']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['create']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['update']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['listTrash']>>[number]>, WithoutJson<TrashedPageItem>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['restoreFromTrash']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<Wire<ReturnType<PagesService['revisions']>>, PageRevisionItem[]>>,
  // справочники
  Expect<Extends<Wire<ReturnType<DictionariesService['listRegions']>>, RegionItem[]>>,
  Expect<Extends<Wire<ReturnType<DictionariesService['createRegion']>>, RegionItem>>,
  Expect<Extends<Wire<ReturnType<DictionariesService['updateRegion']>>, RegionItem>>,
  // манифест: дат нет, поэтому без Jsonify (он плохо переносит рекурсивную JsonSchema)
  Expect<Extends<Awaited<ReturnType<ManifestService['get']>>, BlockManifest | null>>,
];
