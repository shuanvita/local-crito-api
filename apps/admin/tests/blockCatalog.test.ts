import { describe, expect, it } from 'vitest'
import type { ManifestBlock } from '@crito/contract'
import {
  groupEntries,
  matchesPage,
  matchesQuery,
  normalizeSlug,
  pushRecent,
  suggestedForPage,
  toEntry
} from '../app/utils/blockCatalog'

const make = (overrides: Partial<ManifestBlock>): ManifestBlock => ({
  type: 'x',
  title: 'X',
  category: 'content',
  schemaVersion: 1,
  readonly: false,
  aliases: [],
  ...overrides
})

describe('normalizeSlug / matchesPage', () => {
  it('нормализует ведущий и хвостовой слэш', () => {
    expect(normalizeSlug('ai-champ/')).toBe('/ai-champ')
    expect(normalizeSlug('/')).toBe('/')
  })

  it('маска со звёздочкой покрывает раздел и вложенные страницы, но не соседа по префиксу', () => {
    expect(matchesPage('/ai-champ/*', '/ai-champ')).toBe(true)
    expect(matchesPage('/ai-champ/*', '/ai-champ/stages')).toBe(true)
    expect(matchesPage('/ai-champ/*', '/ai-champion')).toBe(false)
  })

  it('маска без звёздочки сравнивается точно', () => {
    expect(matchesPage('/index', '/index')).toBe(true)
    expect(matchesPage('/index', '/index/more')).toBe(false)
  })
})

describe('toEntry', () => {
  it('выносит событие из скобок в группу', () => {
    const entry = toEntry(make({ title: 'Этапы (AI Champ)' }))
    expect(entry).toMatchObject({ title: 'Этапы', group: 'AI Champ', library: false })
  })

  it('поле group главнее скобок и убирает совпадающий хвост из названия', () => {
    expect(toEntry(make({ title: 'Этапы (AI Champ)', group: 'AI Champ' })).title).toBe('Этапы')
    expect(toEntry(make({ title: 'Этапы (2025)', group: 'AI Champ' })).title).toBe('Этапы (2025)')
  })

  it('без события группа — подпись категории; библиотечные блоки скобки не разбираются', () => {
    expect(toEntry(make({ title: 'Достижения', category: 'cards' })).group).toBe('Карточки')
    expect(toEntry(make({ title: 'Текст (простой)', origin: 'library' })).title).toBe('Текст (простой)')
  })
})

describe('suggestedForPage', () => {
  const blocks = [
    make({ type: 'aiChamp.tasks' }),
    make({ type: 'aiChamp.stages' }),
    make({ type: 'award.cta', pages: ['/award/*'] }),
    make({ type: 'telegram' }),
    make({ type: 'faq', origin: 'library' })
  ]

  it('берёт блоки по маске страницы', () => {
    const types = suggestedForPage(blocks, '/award/2025', []).map(block => block.type)
    expect(types).toEqual(['award.cta'])
  })

  it('добавляет использованные и однотипные по префиксу, не трогая библиотеку', () => {
    const types = suggestedForPage(blocks, '/other', ['aiChamp.tasks', 'faq']).map(block => block.type)
    expect(types).toEqual(['aiChamp.tasks', 'aiChamp.stages'])
  })

  it('блок с pages не подсказывается по префиксу, если страница не подходит', () => {
    const list = [make({ type: 'award.cta', pages: ['/award/*'] }), make({ type: 'award.x' })]
    const types = suggestedForPage(list, '/index', ['award.x']).map(block => block.type)
    expect(types).toEqual(['award.x'])
  })
})

describe('поиск, группы и недавние', () => {
  it('ищет по названию, типу, группе и описанию', () => {
    const entry = toEntry(make({ title: 'Этапы (AI Champ)', type: 'aiChamp.stages', description: 'Таймлайн' }))
    for (const query of ['этапы', 'aichamp.st', 'ai champ', 'таймлайн']) {
      expect(matchesQuery(entry, query)).toBe(true)
    }
    expect(matchesQuery(entry, 'нет такого')).toBe(false)
  })

  it('группирует и сортирует записи по названию', () => {
    const entries = [
      toEntry(make({ type: 'b', title: 'Б (Событие)' })),
      toEntry(make({ type: 'a', title: 'А (Событие)' })),
      toEntry(make({ type: 'c', title: 'В', category: 'cards' }))
    ]
    const groups = groupEntries(entries)
    expect(groups.map(group => group.name)).toEqual(['Событие', 'Карточки'])
    expect(groups[0]!.entries.map(entry => entry.title)).toEqual(['А', 'Б'])
  })

  it('недавние: без повторов, свежий первым, не больше шести', () => {
    let recent: string[] = []
    for (const type of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'c']) recent = pushRecent(recent, type)
    expect(recent).toEqual(['c', 'g', 'f', 'e', 'd', 'b'])
  })
})
