/**
 * Публичная отдача файлов медиатеки через админку: `<baseURL>/media/**` -> `<NUXT_API_URL>/media/**`.
 *
 * На проде PUBLIC_BASE_URL указывает на префикс админки (https://edu.mipt.ru/adm/cms-admin), и ссылки на файлы
 * в страницах строятся от него. Без этого маршрута Nuxt отвечал бы на такой адрес HTML-страницей со статусом 200.
 * Служебный токен не подставляется: файлы отдаются публичным эндпоинтом API (`@Public()`).
 */
export default defineEventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    throw createError({ statusCode: 405 })
  }

  const { apiUrl, app } = useRuntimeConfig(event)

  // В зависимости от версии Nitro префикс приложения уже снят или ещё нет (как в cms-api).
  const base = app.baseURL.replace(/\/+$/, '')
  const path = event.path.startsWith(`${base}/`) ? event.path.slice(base.length) : event.path

  return proxyRequest(event, `${apiUrl.replace(/\/+$/, '')}${path}`)
})
