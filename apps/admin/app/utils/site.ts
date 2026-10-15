import type {
  PreviewChannel,
  PreviewDraftMessage,
  PreviewDraftPage,
  PreviewPickMessage,
  PreviewReadyMessage,
  PreviewSelectMessage
} from '@crito/contract'

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
const PREVIEW_CHANNEL: PreviewChannel = 'crito-preview'

/**
 * Адрес страницы для iframe предпросмотра. `1`: сайт принимает черновик; `published`: черновик игнорируется,
 * но блоки помечаются, подсвечиваются и выбираются кликом (старый сайт значение не знает и ведёт себя как обычно).
 */
export function previewFrameUrl(url: string | null, withDraft: boolean): string | null {
  if (!url) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set(PREVIEW_QUERY, withDraft ? '1' : 'published')
    return parsed.toString()
  } catch {
    return url
  }
}

/** Черновик для сайта: то, что видит посетитель (блоки, настройки шапки, SEO). Формат в `@crito/contract`. */
export type PreviewDraft = PreviewDraftPage

/** Сообщение сайту с черновиком. Формат согласован с `usePreviewBridge` в репозитории сайта. */
export function draftMessage(page: PreviewDraft): PreviewDraftMessage {
  return { source: PREVIEW_CHANNEL, type: 'draft', page }
}

/** Сообщение сайту: какой блок выбран в редакторе (null: ни один, выбраны настройки страницы). */
export function selectMessage(blockId: string | null): PreviewSelectMessage {
  return { source: PREVIEW_CHANNEL, type: 'select', blockId }
}

/** Сообщение «страница готова принять черновик», которое присылает сайт. */
export function isReadyMessage(data: unknown): data is PreviewReadyMessage {
  if (typeof data !== 'object' || data === null) return false
  const message = data as { source?: unknown, type?: unknown }
  return message.source === PREVIEW_CHANNEL && message.type === 'ready'
}

/** Сообщение сайта «кликнули по блоку»: id выбираемого в редакторе блока. */
export function pickedBlockId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const message = data as Partial<PreviewPickMessage>
  if (message.source !== PREVIEW_CHANNEL || message.type !== 'pick') return null
  return typeof message.blockId === 'string' && message.blockId ? message.blockId : null
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
