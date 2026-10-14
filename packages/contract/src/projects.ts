/** Проект в ответах API: без секретов. */
export interface ProjectSummary {
  id: string
  slug: string
  name: string
  defaultLocale: string
  /** Адрес вебхука сайта для сброса кэша. */
  revalidateUrl: string | null
  /** null, пока CI не загрузил манифест блоков. */
  manifestHash: string | null
  createdAt: string
  /**
   * Есть ли у пользователя доступ ко всему проекту. Только с ним можно создавать и удалять страницы,
   * пользоваться корзиной и удалять файлы; при доступе к отдельным страницам интерфейс скрывает эти действия.
   */
  fullAccess: boolean
  /**
   * Число живых страниц (без корзины), доступных пользователю: при доступе только к отдельным страницам
   * это их число, а не всего проекта.
   */
  pagesCount: number
  /** Когда последний раз менялась доступная пользователю страница; null, если страниц нет. */
  lastChangedAt: string | null
}

/** `POST /projects` (суперадмин). */
export interface CreateProjectRequest {
  slug: string
  name: string
  defaultLocale?: string
  revalidateUrl?: string
  /** Хранится в БД зашифрованным и назад не возвращается. */
  revalidateSecret?: string
}

/** `PATCH /projects/:project` (суперадмин). Пустая строка в `revalidateUrl` и `revalidateSecret` очищает значение. */
export interface UpdateProjectRequest {
  name?: string
  defaultLocale?: string
  revalidateUrl?: string
  revalidateSecret?: string
}

export interface CreateProjectResponse {
  project: ProjectSummary
  /** Ключ CI для `PUT .../manifest` (заголовок `x-ci-key`). Показывается один раз. */
  ciKey: string
}

export interface RotateCiKeyResponse {
  ciKey: string
}
