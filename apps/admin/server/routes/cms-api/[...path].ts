/**
 * Прокси браузера к API CMS: `<baseURL>/cms-api/**` -> `<NUXT_API_URL>/**`.
 * Адрес берётся из runtimeConfig при запуске сервера, поэтому его можно менять без пересборки.
 *
 * Кто делает запрос, решает прокси, а не браузер: токен серверной сессии из httpOnly-cookie; если её нет,
 * служебный `NUXT_ADMIN_TOKEN` (переходный режим до отключения общего входа); иначе запрос идёт без авторизации
 * и API ответит 401. Заголовки `authorization` и `cookie` браузера дальше не пересылаются. Запрос с `x-cms-secret`
 * (сквозной вход из LMS через nginx) идёт к API с заголовками `x-cms-*` вместо токена.
 * Изменяющие запросы принимаются только с `Origin` этого же хоста (защита от CSRF).
 */
export default defineEventHandler((event) => {
  const { apiUrl, adminToken, app } = useRuntimeConfig(event)

  if (!isSameOrigin(event.method, getRequestHeader(event, 'origin'), getRequestHost(event, { xForwardedHost: true }))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Запрос с чужого адреса' })
  }

  // Админка может работать под префиксом (`/admin`): в зависимости от версии Nitro он уже снят или ещё нет.
  const base = app.baseURL.replace(/\/+$/, '')
  const url = event.path.startsWith(`${base}/`) ? event.path.slice(base.length) : event.path
  const path = url.replace(/^\/cms-api/, '')

  const headers = event.node.req.headers
  // Запрос из LMS: nginx подтвердил пользователя (`auth_request`) и добавил `x-cms-*` с секретом, их проверяет API.
  // Тогда токен не подставляем: пользователь определяется только заголовками. Без секрета такие заголовки
  // из браузера выбрасываем, чтобы они не мешали входу по cookie.
  const fromLms = headers['x-cms-secret'] !== undefined
  if (!fromLms) {
    for (const name of Object.keys(headers)) if (name.startsWith('x-cms-')) delete headers[name]
  }
  const token = fromLms ? '' : getCookie(event, SESSION_COOKIE) || adminToken
  delete headers.authorization
  delete headers.cookie
  // Подделка этого заголовка браузером не должна обходить лимит попыток: ставим только свой.
  delete headers['x-crito-client-ip']

  return proxyRequest(event, `${apiBase(apiUrl)}${path}`, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-crito-client-ip': getRequestIP(event, { xForwardedFor: true }) ?? ''
    }
  })
})
