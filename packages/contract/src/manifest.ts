/**
 * Манифест блоков: сайт собирает его при деплое (`npm run manifest`) и отправляет в CMS
 * (`PUT /projects/:project/manifest`). По нему CMS проверяет данные блоков, а админка строит формы.
 */

/** Подмножество JSON Schema, которое выдаёт `z.toJSONSchema`. */
export interface JsonSchema {
  /** Есть в корне схемы, которую выдаёт zod. */
  $schema?: string
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  /** zod ставит `false` у объектов: лишние поля запрещены. */
  additionalProperties?: boolean | JsonSchema
  pattern?: string
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  const?: unknown
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
  $defs?: Record<string, JsonSchema>
  definitions?: Record<string, JsonSchema>
  title?: string
  description?: string
  default?: unknown
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  /**
   * Подсказка редактора, какой редактор показать для строки:
   * `richtext` (HTML, очищается на сервере), `image` и `link` (адрес, проверяется на сервере).
   */
  'x-field'?: 'richtext' | 'image' | 'link' | (string & {})
}

export interface ManifestBlock {
  /** Глобально уникальное имя вида блока. */
  type: string
  title: string
  /** Категория для каталога блоков: hero, content, media, people, cards, faq, cta, partners, contacts. */
  category: string
  /** Растёт при несовместимых изменениях схемы. */
  schemaVersion: number
  /** Блок без схемы нельзя редактировать: только включить, скрыть или переставить. */
  readonly: boolean
  /** Прежние имена типа: старые данные продолжают работать. */
  aliases: { page?: string, type: string }[]
  /** JSON Schema поля `data`. Есть у всех блоков, кроме `readonly`. */
  schema?: JsonSchema
}

export interface BlockManifest {
  /** Slug проекта: должен совпадать с проектом в адресе запроса. */
  project: string
  version: string
  blocks: ManifestBlock[]
}
