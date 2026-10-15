/** Адрес сайта проекта: `siteUrl`, а если не задан, origin вебхука (как было до появления поля). */
export function siteOrigin(project: { siteUrl?: string | null, revalidateUrl?: string | null } | null | undefined): string | null {
  if (!project) return null
  try {
    if (project.siteUrl) return new URL(project.siteUrl).origin
    return project.revalidateUrl ? new URL(project.revalidateUrl).origin : null
  } catch {
    return null
  }
}

/** Адрес страницы на сайте. Главная хранится как `/index`, а на сайте открывается по `/`. */
export function pageSiteUrl(origin: string | null, slug: string): string | null {
  if (!origin) return null
  return `${origin}${slug === '/index' ? '/' : slug}`
}

/** Параметр, по которому сайт включает приём черновика от админки (только внутри iframe). */
export const PREVIEW_QUERY = 'crito-preview'
const PREVIEW_CHANNEL = 'crito-preview'

/** Адрес страницы для iframe предпросмотра; режим «с правками» включается параметром. */
export function previewFrameUrl(url: string | null, withDraft: boolean): string | null {
  if (!url || !withDraft) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set(PREVIEW_QUERY, '1')
    return parsed.toString()
  } catch {
    return url
  }
}

/** Черновик для сайта: только то, что видит посетитель (id и порядок блоков, настройки шапки, SEO). */
export interface PreviewDraft {
  blocks: unknown[]
  meta?: Record<string, string>
  headerConfig?: string
  noFooterSpacing?: boolean
}

/** Сообщение сайту. Формат согласован с `usePreviewBridge` в репозитории сайта. */
export function draftMessage(page: PreviewDraft) {
  return { source: PREVIEW_CHANNEL, type: 'draft', page }
}

/** Сообщение «страница готова принять черновик», которое присылает сайт. */
export function isReadyMessage(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const message = data as { source?: unknown, type?: unknown }
  return message.source === PREVIEW_CHANNEL && message.type === 'ready'
}

/**
 * Адрес картинки-превью блока из манифеста: относительный путь берётся с сайта проекта.
 * Только http(s) и пути сайта: другие схемы (`javascript:`, `data:`) не пропускаем.
 */
export function resolvePreview(src: string | undefined, origin: string | null): string | null {
  if (!src) return null
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('/') && !src.startsWith('//') && origin) return `${origin}${src}`
  return null
}
