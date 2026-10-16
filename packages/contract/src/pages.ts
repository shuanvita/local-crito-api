import type { ContentBlock, ContentPageMeta, PageFooter, PageHeader } from './content.js'

/** Строка списка страниц: `GET /projects/:project/pages`. */
export interface PageListItem {
  id: string
  slug: string
  version: number
  meta: ContentPageMeta | null
  updatedAt: string
}

/**
 * Сохранённые, но не опубликованные правки страницы. На сайт они не попадают, пока страницу не опубликуют.
 * Черновик один на страницу и общий для всех, кто её редактирует.
 */
export interface PageDraft {
  blocks: ContentBlock[]
  meta: ContentPageMeta | null
  header: PageHeader | null
  footer: PageFooter | null
  noFooterSpacing: boolean
  updatedAt: string
  author: { email: string, name: string | null } | null
}

/**
 * Страница целиком: `GET /projects/:project/pages/:id`, а также ответ на создание, сохранение черновика и публикацию.
 * `blocks`, `meta`, `header`, `footer`, `noFooterSpacing` и `version` это опубликованная версия; правки в `draft`.
 */
export interface PageDetail extends PageListItem {
  blocks: ContentBlock[]
  header: PageHeader | null
  footer: PageFooter | null
  noFooterSpacing: boolean
  /** Дата перемещения в корзину; null у живой страницы. Удалённую страницу нельзя редактировать. */
  deletedAt: string | null
  /** Сохранённые правки, ещё не опубликованные; null, если опубликованная версия и есть последняя. */
  draft: PageDraft | null
}

/** Страница в корзине: `GET /projects/:project/pages/trash` (право на весь проект). */
export interface TrashedPageItem extends PageListItem {
  deletedAt: string
  deletedBy: { email: string, name: string | null } | null
}

/** Содержимое страницы в запросах на создание и сохранение. */
export interface PageContent {
  blocks: ContentBlock[]
  meta?: ContentPageMeta
  /** Шапка страницы; проверяется и очищается по `headerSchema` манифеста. */
  header?: PageHeader
  /** Футер страницы; проверяется и очищается по `footerSchema` манифеста. */
  footer?: PageFooter
  noFooterSpacing?: boolean
}

/** `POST /projects/:project/pages` (право на весь проект). */
export interface CreatePageRequest extends PageContent {
  /** Адрес страницы; сервер приведёт его к виду `/champ`, главная страница хранится как `/index`. */
  slug: string
}

/**
 * `PUT /projects/:project/pages/:id`. Сохраняет черновик: версия не растёт, сайт не меняется.
 * Если содержимое совпало с опубликованным, черновик удаляется.
 */
export interface UpdatePageRequest extends PageContent {
  /** Опубликованная версия, на которой основаны правки. Если страницу успели опубликовать, придёт 409. */
  version: number
}

/** `POST /projects/:project/pages/:id/publish`. Публикует сохранённый черновик как новую версию. */
export interface PublishPageRequest {
  /** Опубликованная версия, которую редактор видел. Если её опередили, придёт 409. */
  version: number
}

/** `GET /projects/:project/pages/:id/revisions`: опубликованные версии, новые сверху. */
export interface PageRevisionItem {
  version: number
  /** Когда версия опубликована. */
  createdAt: string
  /** Кто опубликовал. */
  author: { email: string, name: string | null } | null
}

/** `GET /projects/:project/pages/:id/revisions/:version`: содержимое версии для просмотра и открытия в редакторе. */
export interface PageRevisionDetail extends PageRevisionItem {
  blocks: ContentBlock[]
  meta: ContentPageMeta | null
  header: PageHeader | null
  footer: PageFooter | null
  noFooterSpacing: boolean
}
