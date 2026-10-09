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

/** Начальное значение по схеме: пустое, но проходящее проверку required. */
export function createDefault(schema: JsonSchema, root: JsonSchema = schema): unknown {
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
  const node = resolveSchema(itemSchema, root)
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
