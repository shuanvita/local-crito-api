import { describe, expect, it } from 'vitest'
import type { ContentBlock, JsonSchema } from '@crito/contract'
import {
  createArrayItem,
  createDefault,
  itemTitle,
  moveItem,
  pickVariant,
  pruneEmpty,
  renumberBlocks,
  resolveSchema,
  schemaType,
  switchVariant,
  unionOf
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

// Так zod описывает discriminatedUnion('type', [simple, partner]).
const nomination: JsonSchema = {
  anyOf: [
    {
      type: 'object',
      title: 'Простая номинация',
      properties: {
        type: { type: 'string', const: 'simple' },
        title: { type: 'string' },
        description: { type: 'array', items: { type: 'string' } },
        support: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
      },
      required: ['type', 'title', 'description']
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', const: 'partner' },
        title: { type: 'string' },
        description: { type: 'array', items: { type: 'string' } },
        eligibility: { type: 'array', items: { type: 'string' } }
      },
      required: ['type', 'title', 'description', 'eligibility']
    }
  ]
}

describe('размеченное объединение', () => {
  it('находит различитель и берёт название варианта из title, иначе из const', () => {
    const union = unionOf(nomination, nomination)
    expect(union?.key).toBe('type')
    expect(union?.variants.map(v => [v.value, v.title])).toEqual([['simple', 'Простая номинация'], ['partner', 'partner']])
  })

  it('не считает объединением «тип или null», разные типы и варианты без общего const', () => {
    expect(unionOf({ anyOf: [{ type: 'string' }, { type: 'null' }] }, {})).toBeNull()
    expect(unionOf({ anyOf: [{ type: 'string' }, { type: 'number' }] }, {})).toBeNull()
    expect(unionOf({
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'string' } } }
      ]
    }, {})).toBeNull()
    expect(unionOf({
      anyOf: [
        { type: 'object', properties: { type: { const: 'x' } } },
        { type: 'object', properties: { type: { const: 'x' } } }
      ]
    }, {})).toBeNull()
  })

  it('pickVariant выбирает вариант по значению', () => {
    const union = unionOf(nomination, nomination)!
    expect(pickVariant(union, { type: 'partner' })?.value).toBe('partner')
    expect(pickVariant(union, { type: 'другое' })).toBeUndefined()
    expect(pickVariant(union, null)).toBeUndefined()
  })

  it('createDefault и createArrayItem создают первый вариант с обязательными полями', () => {
    const expected = { type: 'simple', title: '', description: [] }
    expect(createDefault(nomination)).toEqual(expected)
    expect(createArrayItem(nomination, nomination)).toEqual(expected)
  })

  it('switchVariant переносит поля с тем же именем и типом, остальные сбрасывает', () => {
    const union = unionOf(nomination, nomination)!
    const current = { type: 'simple', title: 'ИИ', description: ['а', 'б'], support: { text: 'x' } }
    expect(switchVariant(union, nomination, current, 'partner')).toEqual({
      type: 'partner',
      title: 'ИИ',
      description: ['а', 'б'],
      eligibility: []
    })
  })

  it('switchVariant не переносит поле другого типа', () => {
    const union = unionOf(nomination, nomination)!
    expect(switchVariant(union, nomination, { type: 'simple', title: 5, description: 'строка' }, 'partner'))
      .toEqual({ type: 'partner', title: '', description: [], eligibility: [] })
  })
})
