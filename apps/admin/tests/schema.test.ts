import { describe, expect, it } from 'vitest'
import type { ContentBlock, JsonSchema } from '@crito/contract'
import {
  createArrayItem,
  createDefault,
  itemTitle,
  moveItem,
  pruneEmpty,
  renumberBlocks,
  resolveSchema,
  schemaType
} from '../app/utils/schema'

const faq: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, heading: { type: 'string' }, content: { type: 'string', 'x-field': 'richtext' } },
        required: ['heading', 'content']
      }
    }
  },
  required: ['items']
}

describe('resolveSchema', () => {
  it('раскрывает $ref из $defs', () => {
    const root: JsonSchema = { $defs: { card: { type: 'object', properties: { a: { type: 'string' } } } }, type: 'object' }
    const node = resolveSchema({ $ref: '#/$defs/card', title: 'Карточка' }, root)
    expect(schemaType(node)).toBe('object')
    expect(node.title).toBe('Карточка')
  })

  it('схлопывает nullable (anyOf с null) в исходный тип', () => {
    const node = resolveSchema({ anyOf: [{ type: 'string', 'x-field': 'image' }, { type: 'null' }] }, {})
    expect(node.type).toBe('string')
    expect(node['x-field']).toBe('image')
  })

  it('объединение «число или строка» правится как строка', () => {
    const node = resolveSchema({ anyOf: [{ type: 'number' }, { type: 'string' }] }, {})
    expect(schemaType(node)).toBe('string')
  })

  it('понимает type: ["string", "null"]', () => {
    expect(schemaType(resolveSchema({ type: ['null', 'number'] }, {}))).toBe('number')
  })

  it('не уходит в бесконечную рекурсию на циклических ссылках', () => {
    const root: JsonSchema = { $defs: { a: { $ref: '#/$defs/a' } } }
    expect(() => resolveSchema({ $ref: '#/$defs/a' }, root)).not.toThrow()
  })
})

describe('createDefault', () => {
  it('создаёт объект только с обязательными полями', () => {
    expect(createDefault(faq)).toEqual({ items: [] })
  })

  it('подставляет значения по типам и первое значение enum', () => {
    expect(createDefault({ type: 'string' })).toBe('')
    expect(createDefault({ type: 'integer', minimum: 3 })).toBe(3)
    expect(createDefault({ type: 'boolean' })).toBe(false)
    expect(createDefault({ enum: ['photo', 'video'] })).toBe('photo')
  })
})

describe('createArrayItem', () => {
  it('выдаёт id элементам списка, у которых есть поле id', () => {
    const item = createArrayItem(faq.properties!.items!.items!, faq) as Record<string, unknown>
    expect(item.heading).toBe('')
    expect(item.content).toBe('')
    expect(typeof item.id).toBe('string')
  })
})

describe('pruneEmpty', () => {
  it('убирает undefined, но сохраняет пустые строки и false', () => {
    expect(pruneEmpty({ a: undefined, b: '', c: false, d: [{ e: undefined, f: 0 }] })).toEqual({ b: '', c: false, d: [{ f: 0 }] })
  })
})

describe('renumberBlocks / moveItem', () => {
  const block = (id: string): ContentBlock => ({ id, type: 'faq', order: 999, enabled: true, data: {} })

  it('нумерует блоки с шагом 10', () => {
    expect(renumberBlocks([block('a'), block('b')]).map(b => b.order)).toEqual([10, 20])
  })

  it('переставляет элементы и игнорирует выход за границы', () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
    expect(moveItem([1, 2, 3], 2, 3)).toEqual([1, 2, 3])
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })
})

describe('itemTitle', () => {
  it('берёт первое текстовое поле без HTML и пропускает ссылки', () => {
    expect(itemTitle({ id: 'x', image: '/a.png', heading: '<b>Вопрос</b>' }, 0)).toBe('Вопрос')
  })

  it('предпочитает heading/title, даже если текстовое поле идёт раньше по порядку ключей', () => {
    expect(itemTitle({ content: '<p>Длинный ответ</p>', heading: 'Вопрос', id: 'x' }, 0)).toBe('Вопрос')
  })

  it('возвращает «Элемент N», если подходящих полей нет', () => {
    expect(itemTitle({ image: 'https://x/y.png' }, 2)).toBe('Элемент 3')
  })
})
