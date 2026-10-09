/**
 * Прокси браузера к API CMS: `/cms-api/**` -> `<NUXT_API_URL>/**`.
 * Адрес берётся из runtimeConfig при запуске сервера, поэтому его можно менять без пересборки.
 */
export default defineEventHandler((event) => {
  const { apiUrl } = useRuntimeConfig(event)
  const path = event.path.replace(/^\/cms-api/, '')
  return proxyRequest(event, `${apiUrl.replace(/\/+$/, '')}${path}`)
})
