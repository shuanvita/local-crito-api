import { describe, expect, it } from 'vitest'
import { fromHeaderConfigValue, headerConfigItems, HEADER_CONFIG_DEFAULT, toHeaderConfigValue } from '../app/utils/headerConfig'

const configs = [
  { key: 'home', title: 'Главная' },
  { key: 'champ', title: 'Чемпионат', description: 'С баннером' }
]

describe('headerConfigItems', () => {
  it('начинает с «По умолчанию» и повторяет список манифеста', () => {
    const items = headerConfigItems(configs, 'home')
    expect(items.map(item => item.value)).toEqual([HEADER_CONFIG_DEFAULT, 'home', 'champ'])
    expect(items[2]).toMatchObject({ label: 'Чемпионат', description: 'С баннером' })
  })

  it('пустой ключ не добавляет лишний пункт', () => {
    expect(headerConfigItems(configs, '')).toHaveLength(3)
  })

  it('сохраняет неизвестный ключ с пометкой', () => {
    const items = headerConfigItems(configs, 'legacy')
    expect(items.at(-1)).toEqual({ label: 'legacy (нет в списке)', value: 'legacy' })
  })
})

describe('преобразование значения', () => {
  it('пустая строка и служебное значение переводятся друг в друга', () => {
    expect(toHeaderConfigValue('')).toBe(HEADER_CONFIG_DEFAULT)
    expect(toHeaderConfigValue('home')).toBe('home')
    expect(fromHeaderConfigValue(HEADER_CONFIG_DEFAULT)).toBe('')
    expect(fromHeaderConfigValue('home')).toBe('home')
  })
})
