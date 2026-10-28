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
  CurrentUser,
  FormSubmissionDetail,
  FormSubmissionList,
  IntegrationSummary,
  LoginResponse,
  MediaItem,
  PageDetail,
  PageListItem,
  PageRevisionDetail,
  PageRevisionItem,
  ProjectSummary,
  RegionItem,
  RotateCiKeyResponse,
  SubmitFormResponse,
  TelegramDiscoverResponse,
  TelegramIntegration,
  TelegramTestResponse,
  TrashedPageItem,
  UserAccount,
} from '@crito/contract';
import type { AuthController } from '../src/auth/auth.controller.js';
import type { MeController } from '../src/auth/me.controller.js';
import type { UsersService } from '../src/auth/users.service.js';
import type { DictionariesService } from '../src/dictionaries/dictionaries.service.js';
import type { IntegrationsService } from '../src/integrations/integrations.service.js';
import type { ManifestService } from '../src/manifest/manifest.service.js';
import type { MediaService } from '../src/media/media.service.js';
import type { PagesService } from '../src/pages/pages.service.js';
import type { ProjectsService } from '../src/projects/projects.service.js';
import type { RequestsService } from '../src/requests/requests.service.js';

/** Тип значения после `JSON.stringify` / `JSON.parse`: даты становятся строками. */
type Jsonify<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

type Wire<T> = Jsonify<Awaited<T>>;
type WithoutJson<T> = Omit<T, 'blocks' | 'meta' | 'header' | 'footer'>;
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
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['publish']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['discardDraft']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<Wire<ReturnType<PagesService['revision']>>, PageRevisionDetail>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['listTrash']>>[number]>, WithoutJson<TrashedPageItem>>>,
  Expect<Extends<WithoutJson<Wire<ReturnType<PagesService['restoreFromTrash']>>>, WithoutJson<PageDetail>>>,
  Expect<Extends<Wire<ReturnType<PagesService['revisions']>>, PageRevisionItem[]>>,
  // справочники
  Expect<Extends<Wire<ReturnType<DictionariesService['listRegions']>>, RegionItem[]>>,
  Expect<Extends<Wire<ReturnType<DictionariesService['createRegion']>>, RegionItem>>,
  Expect<Extends<Wire<ReturnType<DictionariesService['updateRegion']>>, RegionItem>>,
  // заявки
  Expect<Extends<Wire<ReturnType<RequestsService['list']>>, FormSubmissionList>>,
  Expect<Extends<Wire<ReturnType<RequestsService['get']>>, FormSubmissionDetail>>,
  Expect<Extends<Wire<ReturnType<RequestsService['submit']>>, SubmitFormResponse>>,
  // интеграции
  Expect<Extends<Wire<ReturnType<IntegrationsService['list']>>, IntegrationSummary[]>>,
  Expect<Extends<Wire<ReturnType<IntegrationsService['getTelegram']>>, TelegramIntegration>>,
  Expect<Extends<Wire<ReturnType<IntegrationsService['updateTelegram']>>, TelegramIntegration>>,
  Expect<Extends<Wire<ReturnType<IntegrationsService['testTelegram']>>, TelegramTestResponse>>,
  Expect<Extends<Wire<ReturnType<IntegrationsService['discoverTelegramChats']>>, TelegramDiscoverResponse>>,
  // текущий пользователь
  Expect<Extends<ReturnType<MeController['me']>, CurrentUser>>,
  // вход и доступы (даты как строки уже в ответе сервиса)
  Expect<Extends<Awaited<ReturnType<AuthController['login']>>, LoginResponse>>,
  Expect<Extends<Awaited<ReturnType<UsersService['list']>>, UserAccount[]>>,
  Expect<Extends<Awaited<ReturnType<UsersService['setGrants']>>, UserAccount>>,
  // манифест: дат нет, поэтому без Jsonify (он плохо переносит рекурсивную JsonSchema)
  Expect<Extends<Awaited<ReturnType<ManifestService['get']>>, BlockManifest | null>>,
];
