import type { ContentBlock, JsonSchema } from '@crito/contract'

const MAX_REF_DEPTH = 20

function lookupRef(ref: string, root: JsonSchema): JsonSchema | undefined {
  const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref)
  if (!match) return undefined
  const name = decodeURIComponent(match[1]!)
  return root.$defs?.[name] ?? root.definitions?.[name]
}

/**
 * Приводит узел схемы к «плоскому» виду: раскрывает `$ref`, `allOf` из одного элемента
 * и `anyOf`/`oneOf` вида «тип или null» (так zod описывает nullable).
 */
export function resolveSchema(schema: JsonSchema, root: JsonSchema, depth = 0): JsonSchema {
  if (depth > MAX_REF_DEPTH) return schema

  if (schema.$ref) {
    const target = lookupRef(schema.$ref, root)
    if (target) {
      const { $ref: _ref, ...rest } = schema
      return resolveSchema({ ...target, ...rest }, root, depth + 1)
    }
  }

  const variants = schema.anyOf ?? schema.oneOf ?? schema.allOf
  if (variants) {
    const meaningful = variants.filter(variant => variant.type !== 'null')
    if (meaningful.length === 1) {
      const { anyOf: _a, oneOf: _o, allOf: _all, ...rest } = schema
      return resolveSchema({ ...meaningful[0]!, ...rest }, root, depth + 1)
    }
    // «число или строка» (например, день месяца): правим как текст, схема принимает оба варианта.
    if (meaningful.length > 1 && meaningful.every(variant => ['string', 'number', 'integer'].includes(variant.type as string))) {
      const { anyOf: _a, oneOf: _o, allOf: _all, ...rest } = schema
      return { ...rest, type: 'string' }
    }
  }

  if (Array.isArray(schema.type)) {
    const type = schema.type.find(t => t !== 'null')
    return { ...schema, type }
  }

  return schema
}

export function schemaType(schema: JsonSchema): string | undefined {
  if (Array.isArray(schema.type)) return schema.type.find(t => t !== 'null')
  if (schema.type) return schema.type
  if (schema.properties) return 'object'
  if (schema.items) return 'array'
  return undefined
}

export function newId(): string {
  return crypto.randomUUID()
}

export interface UnionVariant {
  /** Значение поля-различителя (`const`), например `simple`. */
  value: string
  /** Название для менеджера: `title` варианта в схеме или само значение. */
  title: string
  schema: JsonSchema
}

export interface SchemaUnion {
  /** Поле-различитель (у zod `discriminatedUnion('type', ...)` это `type`). */
  key: string
  variants: UnionVariant[]
}

/**
 * Размеченное объединение: `anyOf`/`oneOf` из объектов, у которых есть общее поле с разными `const`.
 * Так zod описывает `discriminatedUnion`. Любое другое объединение формой не поддерживается (правится как JSON).
 */
export function unionOf(schema: JsonSchema, root: JsonSchema): SchemaUnion | null {
  const node = resolveSchema(schema, root)
  const list = node.oneOf ?? node.anyOf
  if (!list || list.length < 2) return null

  const resolved = list.map(variant => resolveSchema(variant, root))
  if (!resolved.every(variant => schemaType(variant) === 'object' && variant.properties)) return null

  for (const key of Object.keys(resolved[0]!.properties!)) {
    const values = resolved.map(variant => variant.properties![key]?.const)
    if (values.every(value => typeof value === 'string') && new Set(values).size === values.length) {
      return {
        key,
        variants: resolved.map((variant, i) => ({
          value: values[i] as string,
          title: variant.title ?? (values[i] as string),
          schema: variant
        }))
      }
    }
  }
  return null
}

export function pickVariant(union: SchemaUnion, value: unknown): UnionVariant | undefined {
  if (!value || typeof value !== 'object') return undefined
  const current = (value as Record<string, unknown>)[union.key]
  return union.variants.find(variant => variant.value === current)
}

function sameKind(schema: JsonSchema, value: unknown): boolean {
  switch (schemaType(schema)) {
    case 'array': return Array.isArray(value)
    case 'object': return !!value && typeof value === 'object' && !Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'number':
    case 'integer': return typeof value === 'number'
    case 'boolean': return typeof value === 'boolean'
    default: return false
  }
}

/**
 * Значение после смены варианта: пустая заготовка нового варианта, в которую переносятся поля
 * с тем же именем и типом (название, описание). Остальные сбрасываются: схема запрещает лишние поля.
 */
export function switchVariant(union: SchemaUnion, root: JsonSchema, current: unknown, value: string): Record<string, unknown> {
  const variant = union.variants.find(item => item.value === value)
  const next = { ...(createDefault(variant?.schema ?? {}, root) as Record<string, unknown>) }
  const old = current && typeof current === 'object' ? current as Record<string, unknown> : {}

  for (const [key, property] of Object.entries(variant?.schema.properties ?? {})) {
    if (key === union.key || old[key] === undefined) continue
    if (sameKind(resolveSchema(property, root), old[key])) next[key] = old[key]
  }
  next[union.key] = value
  return next
}

/** Начальное значение по схеме: пустое, но проходящее проверку required. */
export function createDefault(schema: JsonSchema, root: JsonSchema = schema): unknown {
  const union = unionOf(schema, root)
  if (union) return createDefault(union.variants[0]!.schema, root)

  const node = resolveSchema(schema, root)
  if (node.default !== undefined) return structuredClone(node.default)
  if (node.const !== undefined) return node.const
  if (node.enum?.length) return node.enum[0]

  switch (schemaType(node)) {
    case 'object': {
      const result: Record<string, unknown> = {}
      for (const key of node.required ?? []) {
        const property = node.properties?.[key]
        if (property) result[key] = createDefault(property, root)
      }
      return result
    }
    case 'array':
      return []
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return node.minimum ?? 0
    case 'boolean':
      return false
    default:
      return null
  }
}

/** Новый элемент массива: объектам с полем `id` (itemId) сразу выдаём идентификатор. */
export function createArrayItem(itemSchema: JsonSchema, root: JsonSchema): unknown {
  const union = unionOf(itemSchema, root)
  const node = union ? union.variants[0]!.schema : resolveSchema(itemSchema, root)
  const value = createDefault(itemSchema, root)
  if (schemaType(node) === 'object' && node.properties?.id && value && typeof value === 'object') {
    (value as Record<string, unknown>).id = newId()
  }
  return value
}

/** Пустые строки в необязательных полях не отправляем: их не ждёт ни схема, ни сайт. */
export function pruneEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => pruneEmpty(item)) as T
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      result[key] = pruneEmpty(item)
    }
    return result as T
  }
  return value
}

/** Порядок блоков хранится в `order` с шагом 10: между блоками остаётся место для вставки. */
export function renumberBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.map((block, index) => ({ ...block, order: (index + 1) * 10 }))
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item!)
  return copy
}

const LABELS: Record<string, string> = {
  title: 'Заголовок',
  subtitle: 'Подзаголовок',
  description: 'Описание',
  text: 'Текст',
  content: 'Содержимое',
  heading: 'Заголовок',
  items: 'Элементы',
  image: 'Изображение',
  images: 'Изображения',
  alt: 'Альтернативный текст',
  caption: 'Подпись',
  label: 'Подпись',
  link: 'Ссылка',
  url: 'Ссылка',
  href: 'Ссылка',
  videoUrl: 'Ссылка на видео',
  name: 'Имя',
  tags: 'Теги',
  color: 'Цвет',
  aspect: 'Пропорции',
  buttonLabel: 'Текст кнопки',
  isBackground: 'Фоновая подложка',
  descriptionWidth: 'Ширина описания'
}

/** Подпись поля: `title` из схемы, словарь типовых ключей или сам ключ. */
export function fieldLabel(key: string, schema: JsonSchema): string {
  return schema.title ?? LABELS[key] ?? key
}

const TITLE_KEYS = ['title', 'heading', 'name', 'label', 'text']

const MAX_TITLE_LENGTH = 48

/** Текст без HTML; ссылки и пути не годятся в название. */
function plainText(value: unknown): string | undefined {
  if (typeof value !== 'string' || /^(https?:|\/)/.test(value)) return undefined
  const plain = value.replace(/<[^>]+>/g, '').trim()
  if (!plain) return undefined
  return plain.length > MAX_TITLE_LENGTH ? `${plain.slice(0, MAX_TITLE_LENGTH)}…` : plain
}

/**
 * Название элемента списка: сначала поля title/heading/name/label/text, затем первое строковое.
 * Порядок ключей не гарантирован (PostgreSQL JSONB хранит их по алфавиту), поэтому ищем по именам.
 */
export function itemTitle(value: unknown, index: number): string {
  const text = plainText(value)
  if (text) return text

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const others = Object.entries(record).filter(([key]) => key !== 'id').map(([, item]) => item)
    for (const candidate of [...TITLE_KEYS.map(key => record[key]), ...others]) {
      const plain = plainText(candidate)
      if (plain) return plain
    }
  }
  return `Элемент ${index + 1}`
}
