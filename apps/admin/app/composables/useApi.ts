import type { ApiErrorBody } from '@crito/contract'

/**
 * Клиент API CMS. Запросы идут на `/cms-api/**`, который проксируется на бэкенд.
 * 401 означает, что сессии нет: вход возможен только через LMS (подключим в конце).
 */
export function useApi() {
  const config = useRuntimeConfig()
  // Админка может жить под префиксом (/admin): прокси лежит рядом с ней, а не в корне домена.
  const base = config.app.baseURL.replace(/\/+$/, '')

  return $fetch.create({
    baseURL: `${base}${config.public.apiBase}`,
    onResponseError({ response }) {
      if (response.status === 401) {
        navigateTo('/no-access')
      }
    }
  })
}

/** Сообщение об ошибке API для тоста. */
export function apiErrorMessage(error: unknown): string {
  const data = (error as { data?: Partial<ApiErrorBody> }).data
  if (data?.errors?.length) {
    return [data.message, ...data.errors].filter(Boolean).join('\n')
  }
  return data?.message ?? (error instanceof Error ? error.message : 'Неизвестная ошибка')
}
