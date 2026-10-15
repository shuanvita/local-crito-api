import { describe, expect, it } from 'vitest'
import { pageSiteUrl, resolvePreview, siteOrigin } from '../app/utils/site'

describe('siteOrigin', () => {
  it('берёт siteUrl, иначе origin вебхука', () => {
    expect(siteOrigin({ siteUrl: 'https://nuxt.rucode.net', revalidateUrl: 'https://other.test/api/revalidate' }))
      .toBe('https://nuxt.rucode.net')
    expect(siteOrigin({ siteUrl: null, revalidateUrl: 'https://rucode.net/api/revalidate' })).toBe('https://rucode.net')
  })

  it('без адресов и при мусоре возвращает null', () => {
    expect(siteOrigin(null)).toBeNull()
    expect(siteOrigin({ siteUrl: null, revalidateUrl: null })).toBeNull()
    expect(siteOrigin({ siteUrl: 'not a url' })).toBeNull()
  })
})

describe('pageSiteUrl', () => {
  it('главная открывается по корню', () => {
    expect(pageSiteUrl('https://a.test', '/index')).toBe('https://a.test/')
    expect(pageSiteUrl('https://a.test', '/champ')).toBe('https://a.test/champ')
    expect(pageSiteUrl(null, '/champ')).toBeNull()
  })
})

describe('resolvePreview', () => {
  it('достраивает относительный путь и отбрасывает опасные схемы', () => {
    expect(resolvePreview('/previews/hero.png', 'https://a.test')).toBe('https://a.test/previews/hero.png')
    expect(resolvePreview('https://cdn.test/x.png', null)).toBe('https://cdn.test/x.png')
    expect(resolvePreview('/x.png', null)).toBeNull()
    expect(resolvePreview('//evil.test/x.png', 'https://a.test')).toBeNull()
    expect(resolvePreview('javascript:alert(1)', 'https://a.test')).toBeNull()
    expect(resolvePreview('data:image/svg+xml,<svg/>', 'https://a.test')).toBeNull()
    expect(resolvePreview(undefined, 'https://a.test')).toBeNull()
  })
})
