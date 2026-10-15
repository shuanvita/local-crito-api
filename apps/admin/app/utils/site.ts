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
