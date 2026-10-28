import { describe, expect, it } from 'vitest'
import { apiBase, cookiePath, isSameOrigin } from '../server/utils/auth'

describe('isSameOrigin (защита от CSRF)', () => {
  it('безопасные методы проходят без Origin', () => {
    expect(isSameOrigin('GET', undefined, 'edu.mipt.ru')).toBe(true)
    expect(isSameOrigin('HEAD', undefined, undefined)).toBe(true)
  })

  it('изменяющий запрос с Origin того же хоста проходит', () => {
    expect(isSameOrigin('POST', 'https://edu.mipt.ru', 'edu.mipt.ru')).toBe(true)
    expect(isSameOrigin('PUT', 'https://EDU.mipt.ru', 'edu.mipt.ru')).toBe(true)
    expect(isSameOrigin('DELETE', 'http://localhost:3100', 'localhost:3100')).toBe(true)
  })

  it('чужой Origin, отсутствующий Origin и мусор отклоняются', () => {
    expect(isSameOrigin('POST', 'https://evil.example', 'edu.mipt.ru')).toBe(false)
    expect(isSameOrigin('POST', 'https://edu.mipt.ru.evil.example', 'edu.mipt.ru')).toBe(false)
    expect(isSameOrigin('PATCH', undefined, 'edu.mipt.ru')).toBe(false)
    expect(isSameOrigin('POST', 'null', 'edu.mipt.ru')).toBe(false)
    expect(isSameOrigin('POST', 'https://edu.mipt.ru', undefined)).toBe(false)
  })

  it('x-forwarded-host со списком: берётся первый хост', () => {
    expect(isSameOrigin('POST', 'https://edu.mipt.ru', 'edu.mipt.ru, proxy.internal')).toBe(true)
  })
})

describe('вспомогательные', () => {
  it('cookiePath ограничивает cookie префиксом админки', () => {
    expect(cookiePath('/adm/cms-admin/')).toBe('/adm/cms-admin')
    expect(cookiePath('/')).toBe('/')
    expect(cookiePath('/admin')).toBe('/admin')
  })

  it('apiBase убирает хвостовой слэш', () => {
    expect(apiBase('http://127.0.0.1:3200/')).toBe('http://127.0.0.1:3200')
  })
})
