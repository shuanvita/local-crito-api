/**
 * Модель содержимого страницы. Совпадает с форматом `ContentPage` сайта
 * (`parseContentPage` во фронтенде): сайт читает его с публичного эндпоинта CMS.
 */

export interface ContentBlock<T = unknown> {
  id: string
  /** Тип блока из манифеста сайта, например `faq` или `champ.hero`. */
  type: string
  /** Порядок на странице; админка хранит его с шагом 10. */
  order: number
  enabled: boolean
  /** Якорь для ссылок вида `/#anchor`. */
  anchor?: string
  /** Версия схемы `data`: нужна сайту для миграций данных старых версий. */
  schemaVersion?: number
  data: T
}

/** SEO-метаданные страницы. */
export interface ContentPageMeta {
  title?: string
  description?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

/**
 * Шапка страницы: логотипы, ссылки и т. п. Форму задаёт сайт в манифесте (`headerSchema`),
 * CMS по ней проверяет и очищает данные, но сама их устройство не знает.
 */
export type PageHeader = Record<string, unknown>

/** Страница в формате публичного API: `GET /public/:project/pages/:slug`. */
export interface ContentPage {
  slug: string
  version: number
  blocks: ContentBlock[]
  meta?: ContentPageMeta
  /** Ключ конфигурации шапки и футера на сайте. */
  headerConfig?: string
  /** Шапка страницы; без неё сайт берёт готовый вариант по `headerConfig`. */
  header?: PageHeader
  noFooterSpacing?: boolean
}
