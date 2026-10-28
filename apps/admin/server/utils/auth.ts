/** Имя httpOnly-cookie с токеном серверной сессии API. Браузерный JS её не читает. */
export const SESSION_COOKIE = 'crito_session'

/** Срок cookie равен безусловному пределу сессии на стороне API (7 дней); раньше сессию обрывает API. */
export const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60

/** Методы без побочных эффектов: проверка Origin им не нужна. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Защита от CSRF для запросов с cookie: изменяющий запрос принимается, только если браузер прислал `Origin`
 * того же хоста, на котором работает админка. Нет `Origin` (не браузер, старый клиент) это отказ.
 * Хост берём из `x-forwarded-host` (за nginx), иначе из `host`.
 */
export function isSameOrigin(method: string, origin: string | undefined, host: string | undefined): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.split(',')[0]!.trim().toLowerCase()
  } catch {
    return false
  }
}

/** Адрес API без хвостового слэша. */
export function apiBase(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

/** Путь cookie: только под префиксом админки, чтобы соседние приложения на домене её не получали. */
export function cookiePath(baseURL: string): string {
  return `/${baseURL.replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '') || '/'
}
