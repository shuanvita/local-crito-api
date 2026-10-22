import type { ProjectSummary } from '@crito/contract'

/** Проекты, доступные пользователю. Общий кэш на все компоненты. */
export function useProjects() {
  const api = useApi()
  // Со слэшем в конце: запрос без него в проде получал от прокси редирект на http:// (Mixed Content).
  return useAsyncData('projects', () => api<ProjectSummary[]>('/projects/'), {
    default: () => []
  })
}

/** Slug проекта из адреса (`/:project/...`). */
export function useCurrentProjectSlug() {
  const route = useRoute()
  return computed(() => {
    const param = route.params.project
    return typeof param === 'string' ? param : undefined
  })
}
