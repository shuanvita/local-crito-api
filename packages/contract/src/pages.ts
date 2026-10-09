import type { ContentBlock, ContentPageMeta } from './content.js'

/** Строка списка страниц: `GET /projects/:project/pages`. */
export interface PageListItem {
  id: string
  slug: string
  version: number
  meta: ContentPageMeta | null
  updatedAt: string
}

/** Страница целиком: `GET /projects/:project/pages/:id`, а также ответ на создание и сохранение. */
export interface PageDetail extends PageListItem {
  blocks: ContentBlock[]
  headerConfig: string | null
  noFooterSpacing: boolean
  /** Дата перемещения в корзину; null у живой страницы. Удалённую страницу нельзя редактировать. */
  deletedAt: string | null
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
  headerConfig?: string
  noFooterSpacing?: boolean
}

/** `POST /projects/:project/pages` (право на весь проект). */
export interface CreatePageRequest extends PageContent {
  /** Адрес страницы; сервер приведёт его к виду `/champ`, главная страница хранится как `/index`. */
  slug: string
}

/** `PUT /projects/:project/pages/:id`. Сохранение сразу публикует страницу. */
export interface UpdatePageRequest extends PageContent {
  /** Версия, которую редактор открыл. Если страницу успели сохранить, придёт 409. */
  version: number
}

/** `GET /projects/:project/pages/:id/revisions`. */
export interface PageRevisionItem {
  version: number
  createdAt: string
  author: { email: string, name: string | null } | null
}
