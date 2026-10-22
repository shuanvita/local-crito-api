import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Маршрут использует автоимпорты Nitro: подменяем их и проверяем только логику прокси.
const proxyRequest = vi.fn(async (_event: unknown, target: string, _opts?: unknown) => target)
const createError = vi.fn((input: { statusCode: number }) => Object.assign(new Error('http'), input))

async function run(event: { method: string, path: string }, baseURL = '/adm/cms-admin/') {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ apiUrl: 'http://127.0.0.1:3200/', app: { baseURL } }))
  vi.stubGlobal('proxyRequest', proxyRequest)
  vi.stubGlobal('createError', createError)
  const mod = await import('../server/routes/media/[...path]')
  return (mod.default as unknown as (e: typeof event) => Promise<string>)(event)
}

describe('прокси файлов медиатеки', () => {
  beforeEach(() => {
    vi.resetModules()
    proxyRequest.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('снимает префикс админки и идёт в публичный эндпоинт API', async () => {
    const target = await run({ method: 'GET', path: '/adm/cms-admin/media/rucode/abc.jpg' })
    expect(target).toBe('http://127.0.0.1:3200/media/rucode/abc.jpg')
  })

  it('работает, если Nitro уже снял префикс', async () => {
    const target = await run({ method: 'GET', path: '/media/rucode/abc.jpg' })
    expect(target).toBe('http://127.0.0.1:3200/media/rucode/abc.jpg')
  })

  it('без префикса приложения (локальная разработка)', async () => {
    const target = await run({ method: 'HEAD', path: '/media/rucode/abc.jpg' }, '/')
    expect(target).toBe('http://127.0.0.1:3200/media/rucode/abc.jpg')
  })

  it('не подставляет служебный токен', async () => {
    await run({ method: 'GET', path: '/media/rucode/abc.jpg' })
    expect(proxyRequest.mock.calls[0]).toHaveLength(2)
  })

  it('остальные методы отклоняет с 405', async () => {
    await expect(run({ method: 'POST', path: '/media/rucode/abc.jpg' })).rejects.toMatchObject({ statusCode: 405 })
    expect(proxyRequest).not.toHaveBeenCalled()
  })
})
