import { describe, expect, it } from 'vitest'
import { draftMessage, isReadyMessage, pageSiteUrl, previewFrameUrl, resolvePreview, selectMessage, siteOrigin } from '../app/utils/site'

describe('предпросмотр с правками', () => {
  it('добавляет параметр только в режиме черновика', () => {
    expect(previewFrameUrl('https://a.test/news?x=1', true)).toBe('https://a.test/news?x=1&crito-preview=1')
    expect(previewFrameUrl('https://a.test/', false)).toBe('https://a.test/')
    expect(previewFrameUrl(null, true)).toBeNull()
  })

  it('формат сообщений совпадает с сайтом', () => {
    expect(draftMessage({ blocks: [] })).toEqual({ source: 'crito-preview', type: 'draft', page: { blocks: [] } })
    expect(selectMessage('b1')).toEqual({ source: 'crito-preview', type: 'select', blockId: 'b1' })
    expect(selectMessage(null)).toEqual({ source: 'crito-preview', type: 'select', blockId: null })
    expect(isReadyMessage({ source: 'crito-preview', type: 'ready' })).toBe(true)
    expect(isReadyMessage({ source: 'other', type: 'ready' })).toBe(false)
    expect(isReadyMessage(null)).toBe(false)
  })
})

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
