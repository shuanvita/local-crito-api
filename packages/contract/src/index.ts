/**
 * @crito/contract: типы данных между API, админкой и сайтами.
 *
 * Пакет содержит только типы и подключается без сборки (`import type`), поэтому рантайм-значений
 * здесь быть не должно. Описывает формат JSON «по проводу»: даты приходят строками.
 */
export type { Grant } from './auth.js'
export type { ContentBlock, ContentPage, ContentPageMeta } from './content.js'
export type { CreateRegionRequest, PublicRegion, RegionItem, UpdateRegionRequest } from './dictionaries.js'
export type { ApiErrorBody } from './errors.js'
export type { ExportFile } from './import.js'
export type { BlockManifest, JsonSchema, ManifestBlock, ManifestHeaderConfig } from './manifest.js'
export type { CurrentUser } from './me.js'
export type { MediaItem } from './media.js'
export type {
  CreatePageRequest,
  PageContent,
  PageDetail,
  PageListItem,
  PageRevisionItem,
  TrashedPageItem,
  UpdatePageRequest,
} from './pages.js'
export type {
  PreviewChannel,
  PreviewDraftMessage,
  PreviewDraftPage,
  PreviewMessageToAdmin,
  PreviewMessageToSite,
  PreviewPickMessage,
  PreviewReadyMessage,
  PreviewSelectMessage,
} from './preview.js'
export type {
  CreateProjectRequest,
  CreateProjectResponse,
  ProjectSummary,
  RotateCiKeyResponse,
  UpdateProjectRequest,
} from './projects.js'
