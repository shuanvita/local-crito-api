import type { ApiErrorBody } from '@crito/contract'

/**
 * Клиент API CMS. Запросы идут на `/cms-api/**`, который проксируется на бэкенд.
 * 401 означает, что сессии нет или она истекла: отправляем на страницу входа (позже её заменит вход через LMS).
 * 403 при открытии самого проекта значит, что доступа к нему нет.
 */
export function useApi() {
  const config = useRuntimeConfig()
  // Админка может жить под префиксом (/admin): прокси лежит рядом с ней, а не в корне домена.
  const base = config.app.baseURL.replace(/\/+$/, '')
  const route = useRoute()

  return $fetch.create({
    baseURL: `${base}${config.public.apiBase}`,
    onResponseError({ request, response }) {
      if (response.status === 401 && route.path !== '/login') {
        // Адрес, куда вернуться после входа; только внутренний путь, чужой адрес не принимаем.
        const redirect = route.fullPath.startsWith('/') && !route.fullPath.startsWith('//') ? route.fullPath : '/'
        navigateTo({ path: '/login', query: redirect === '/' ? {} : { redirect } })
      } else if (response.status === 403 && /^\/projects\/[^/]+\/?$/.test(String(request))) {
        navigateTo('/no-access')
      }
    }
  })
}

/** Выход: закрывает сессию и перезагружает приложение, чтобы кэш предыдущего пользователя не остался. */
export async function logout() {
  const base = useRuntimeConfig().app.baseURL.replace(/\/+$/, '')
  await $fetch(`${base}/auth/logout`, { method: 'POST' }).catch(() => undefined)
  window.location.assign(`${base}/login`)
}

/** Сообщение об ошибке API для тоста. */
export function apiErrorMessage(error: unknown): string {
  const data = (error as { data?: Partial<ApiErrorBody> }).data
  if (data?.errors?.length) {
    return [data.message, ...data.errors].filter(Boolean).join('\n')
  }
  return data?.message ?? (error instanceof Error ? error.message : 'Неизвестная ошибка')
}
