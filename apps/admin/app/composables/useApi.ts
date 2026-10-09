import type { ApiErrorBody } from '@crito/contract'

/**
 * Клиент API CMS. Запросы идут на `/cms-api/**`, который проксируется на бэкенд.
 * 401 означает, что сессии нет: вход возможен только через LMS (подключим в конце).
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public

  return $fetch.create({
    baseURL: apiBase,
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
