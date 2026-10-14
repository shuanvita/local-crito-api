import type { CurrentUser } from '@crito/contract'

/**
 * Кто вошёл. По `isSuperAdmin` интерфейс показывает действия администратора (правка общих справочников);
 * сами права всё равно проверяет API, поэтому подмена на клиенте ничего не открывает.
 */
export function useMe() {
  const api = useApi()
  return useAsyncData('me', () => api<CurrentUser>('/me'), { default: () => null })
}
