/**
 * Прокси браузера к API CMS: `<baseURL>/cms-api/**` -> `<NUXT_API_URL>/**`.
 * Адрес берётся из runtimeConfig при запуске сервера, поэтому его можно менять без пересборки.
 *
 * Если задан `NUXT_ADMIN_TOKEN`, прокси подставляет его как служебный токен API: вход через LMS ещё не
 * реализован, а админка закрыта на уровне nginx. Заголовок браузера в этом случае не пересылается.
 */
export default defineEventHandler((event) => {
  const { apiUrl, adminToken, app } = useRuntimeConfig(event)

  // Админка может работать под префиксом (`/admin`): в зависимости от версии Nitro он уже снят или ещё нет.
  const base = app.baseURL.replace(/\/+$/, '')
  const url = event.path.startsWith(`${base}/`) ? event.path.slice(base.length) : event.path
  const path = url.replace(/^\/cms-api/, '')

  return proxyRequest(event, `${apiUrl.replace(/\/+$/, '')}${path}`, {
    headers: adminToken ? { authorization: `Bearer ${adminToken}` } : undefined
  })
})
