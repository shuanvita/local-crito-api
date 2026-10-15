import { describe, expect, it } from 'vitest'
import { buildSeoPreview, descriptionLevel, truncate } from '../app/utils/seo'

const resolveImage = (src: string | undefined) => src ?? null

describe('descriptionLevel', () => {
  it('различает пустое, короткое, хорошее и длинное', () => {
    expect(descriptionLevel(undefined)).toBe('empty')
    expect(descriptionLevel('   ')).toBe('empty')
    expect(descriptionLevel('а'.repeat(50))).toBe('short')
    expect(descriptionLevel('а'.repeat(120))).toBe('good')
    expect(descriptionLevel('а'.repeat(160))).toBe('good')
    expect(descriptionLevel('а'.repeat(161))).toBe('long')
  })
})

describe('truncate', () => {
  it('короткий текст не трогает', () => {
    expect(truncate('Главная', 60)).toBe('Главная')
  })

  it('режет по слову и добавляет многоточие, не превышая предел', () => {
    const result = truncate('один два три четыре пять шесть семь', 20)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(20)
    expect(result).toBe('один два три четыре…')
  })

  it('режет по символам, если пробелов нет', () => {
    expect(truncate('а'.repeat(100), 10)).toBe(`${'а'.repeat(9)}…`)
  })
})

describe('buildSeoPreview', () => {
  const options = { siteUrl: 'https://rucode.net/champ', slug: '/champ', resolveImage }

  it('поля соцсетей пустые: берёт SEO и помечает подстановку', () => {
    const { social } = buildSeoPreview({ title: 'Чемпионат', description: 'Описание' }, options)
    expect(social.title).toBe('Чемпионат')
    expect(social.description).toBe('Описание')
    expect(social.titleFallback).toBe(true)
    expect(social.descriptionFallback).toBe(true)
  })

  it('заданные поля соцсетей важнее SEO', () => {
    const { social } = buildSeoPreview({ title: 'A', ogTitle: 'B', ogDescription: 'C', ogImage: '/og.png' }, options)
    expect(social.title).toBe('B')
    expect(social.description).toBe('C')
    expect(social.image).toBe('/og.png')
    expect(social.titleFallback).toBe(false)
  })

  it('без заголовка показывает заглушку, адрес берёт из siteUrl', () => {
    const { search } = buildSeoPreview({}, options)
    expect(search.title).toBe('Без заголовка')
    expect(search.host).toBe('rucode.net')
    expect(search.path).toBe('/champ')
  })

  it('без адреса сайта показывает путь страницы, главная без пути', () => {
    expect(buildSeoPreview({}, { siteUrl: null, slug: '/about', resolveImage }).search.path).toBe('/about')
    expect(buildSeoPreview({}, { siteUrl: null, slug: '/index', resolveImage }).search.path).toBe('')
  })
})
