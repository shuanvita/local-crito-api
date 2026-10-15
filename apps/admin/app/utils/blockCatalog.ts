import type { ManifestBlock } from '@crito/contract'

/** Подписи категорий манифеста; неизвестная категория показывается как есть. */
export const CATEGORY_LABELS: Record<string, string> = {
  hero: 'Главный экран',
  content: 'Контент',
  media: 'Медиа',
  people: 'Люди',
  cards: 'Карточки',
  faq: 'Вопросы и ответы',
  cta: 'Призыв к действию',
  partners: 'Партнёры',
  contacts: 'Контакты'
}

export const CATEGORY_ICONS: Record<string, string> = {
  hero: 'i-lucide-panel-top',
  content: 'i-lucide-file-text',
  media: 'i-lucide-image',
  people: 'i-lucide-users',
  cards: 'i-lucide-layout-grid',
  faq: 'i-lucide-circle-help',
  cta: 'i-lucide-megaphone',
  partners: 'i-lucide-handshake',
  contacts: 'i-lucide-phone'
}

export type CatalogTab = 'page' | 'all' | 'library'

export interface CatalogEntry {
  block: ManifestBlock
  /** Название без хвоста «(Событие)», если событие вынесено в группу. */
  title: string
  /** Группа для боковой навигации. */
  group: string
  library: boolean
}

const TRAILING_GROUP = /^(.*?)\s*\(([^()]+)\)\s*$/

/** Приводит адрес страницы к виду, в котором его пишут в масках: с ведущим `/`, без хвостового. */
export function normalizeSlug(slug: string): string {
  const withSlash = slug.startsWith('/') ? slug : `/${slug}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

/** `/ai-champ/*` подходит к `/ai-champ` и ко всему, что глубже; остальные маски сравниваются точно. */
export function matchesPage(mask: string, slug: string): boolean {
  const page = normalizeSlug(slug)
  if (mask.endsWith('*')) {
    const prefix = normalizeSlug(mask.slice(0, -1))
    return page === prefix || page.startsWith(`${prefix}/`)
  }
  return normalizeSlug(mask) === page
}

/** Название и группа: поле `group` главнее, иначе берём событие из скобок в названии, иначе категорию. */
export function toEntry(block: ManifestBlock): CatalogEntry {
  const library = block.origin === 'library'
  const parsed = TRAILING_GROUP.exec(block.title)
  if (block.group) {
    return { block, title: parsed && parsed[2] === block.group ? parsed[1]! : block.title, group: block.group, library }
  }
  if (parsed && !library) {
    return { block, title: parsed[1]!, group: parsed[2]!, library }
  }
  return { block, title: block.title, group: CATEGORY_LABELS[block.category] ?? block.category, library }
}

/** Часть типа до первой точки: `aiChamp.tasks` -> `aiChamp`. Без точки префикса нет. */
function typePrefix(type: string): string | null {
  const dot = type.indexOf('.')
  return dot > 0 ? type.slice(0, dot) : null
}

/**
 * Блоки, подходящие странице: явно указанные в `pages`, уже использованные на ней
 * и (для блоков без `pages`) однотипные по префиксу с использованными: `aiChamp.*`.
 */
export function suggestedForPage(blocks: ManifestBlock[], slug: string, usedTypes: string[]): ManifestBlock[] {
  const used = new Set(usedTypes)
  const prefixes = new Set(usedTypes.map(typePrefix).filter((prefix): prefix is string => prefix !== null))
  return blocks.filter((block) => {
    if (block.origin === 'library') return false
    if (used.has(block.type)) return true
    if (block.pages?.length) return block.pages.some(mask => matchesPage(mask, slug))
    const prefix = typePrefix(block.type)
    return prefix !== null && prefixes.has(prefix)
  })
}

export function matchesQuery(entry: CatalogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const { block } = entry
  return [block.title, block.type, entry.group, block.description ?? '', CATEGORY_LABELS[block.category] ?? block.category]
    .some(value => value.toLowerCase().includes(needle))
}

export interface CatalogGroup {
  name: string
  entries: CatalogEntry[]
}

/** Группирует с сохранением порядка появления групп; записи внутри группы по названию. */
export function groupEntries(entries: CatalogEntry[]): CatalogGroup[] {
  const groups = new Map<string, CatalogEntry[]>()
  for (const entry of entries) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry])
  return [...groups.entries()].map(([name, items]) => ({
    name,
    entries: [...items].sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }))
}

const RECENT_LIMIT = 6

/** Добавляет тип в начало списка недавних без повторов. */
export function pushRecent(recent: string[], type: string): string[] {
  return [type, ...recent.filter(item => item !== type)].slice(0, RECENT_LIMIT)
}
