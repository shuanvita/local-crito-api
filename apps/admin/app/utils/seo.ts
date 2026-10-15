import type { ContentPageMeta } from '@crito/contract'

/** Рекомендуемые пределы: длиннее поисковик обрежет заголовок или описание. */
export const SEO_TITLE_MAX = 60
export const SEO_DESCRIPTION_MAX = 160
export const SEO_DESCRIPTION_MIN = 120

export type SeoLevel = 'empty' | 'short' | 'good' | 'long'

/** Состояние описания для подсказки: пустое и слишком короткое хуже, чем 120–160 символов. */
export function descriptionLevel(value: string | undefined): SeoLevel {
  const length = (value ?? '').trim().length
  if (length === 0) return 'empty'
  if (length < SEO_DESCRIPTION_MIN) return 'short'
  if (length > SEO_DESCRIPTION_MAX) return 'long'
  return 'good'
}

/** Обрезка по границе слова с многоточием; как поисковик, но без точности до пикселя. */
export function truncate(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

export interface SeoPreviewData {
  /** Сниппет поиска: заголовок, адрес, описание. */
  search: { title: string, description: string, host: string, path: string }
  /** Карточка соцсети: что подставится, если поля соцсетей пустые. */
  social: { title: string, description: string, image: string | null, host: string, titleFallback: boolean, descriptionFallback: boolean }
}

/**
 * Что увидят в поиске и в соцсетях. Поля соцсетей пустые → берутся из SEO-полей, а заголовок в
 * последнюю очередь из названия страницы: так же ведёт себя сайт.
 */
export function buildSeoPreview(meta: ContentPageMeta, options: { siteUrl: string | null, slug: string, resolveImage: (src: string | undefined) => string | null }): SeoPreviewData {
  const title = (meta.title ?? '').trim()
  const description = (meta.description ?? '').trim()
  const ogTitle = (meta.ogTitle ?? '').trim()
  const ogDescription = (meta.ogDescription ?? '').trim()

  let host = ''
  let path = ''
  if (options.siteUrl) {
    try {
      const url = new URL(options.siteUrl)
      host = url.host
      path = url.pathname === '/' ? '' : url.pathname
    } catch {
      // Адрес сайта некорректен: показываем без хоста.
    }
  }
  if (!path && !host) path = options.slug === '/index' ? '' : options.slug

  return {
    search: {
      title: truncate(title || 'Без заголовка', SEO_TITLE_MAX),
      description: truncate(description, SEO_DESCRIPTION_MAX),
      host,
      path
    },
    social: {
      title: truncate(ogTitle || title || 'Без заголовка', SEO_TITLE_MAX),
      description: truncate(ogDescription || description, SEO_DESCRIPTION_MAX),
      image: options.resolveImage(meta.ogImage),
      host,
      titleFallback: !ogTitle,
      descriptionFallback: !ogDescription
    }
  }
}
