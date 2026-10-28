/** Проект в ответах API: без секретов. */
export interface ProjectSummary {
  id: string
  slug: string
  name: string
  defaultLocale: string
  /** Адрес вебхука сайта для сброса кэша. */
  revalidateUrl: string | null
  /**
   * Адрес сайта без пути и хвостового слэша (`https://nuxt.rucode.net`): по нему админка показывает
   * предпросмотр страницы и ссылку «Открыть на сайте». null, пока не задан.
   */
  siteUrl: string | null
  /**
   * Номер счётчика Яндекс Метрики сайта: справка для менеджеров, задаётся разработчиками.
   * Публичный API его не отдаёт: сайт подключает счётчик в своём коде.
   */
  metrikaCounterId: string | null
  /** null, пока CI не загрузил манифест блоков. */
  manifestHash: string | null
  createdAt: string
  /**
   * Есть ли у пользователя доступ ко всему проекту. Только с ним можно создавать и удалять страницы,
   * пользоваться корзиной и удалять файлы; при доступе к отдельным страницам интерфейс скрывает эти действия.
   */
  fullAccess: boolean
  /** Есть ли доступ к заявкам проекта (персональные данные): при доступе ко всему проекту или по роли из LMS. */
  requestsAccess: boolean
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
  /** Адрес сайта для предпросмотра: `https://` (для localhost допустим `http://`), без пути. */
  siteUrl?: string
  /** Только цифры, до 12 знаков. */
  metrikaCounterId?: string
  /** Хранится в БД зашифрованным и назад не возвращается. */
  revalidateSecret?: string
}

/**
 * `PATCH /projects/:project` (суперадмин). Пустая строка в `revalidateUrl`, `siteUrl`, `revalidateSecret`
 * и `metrikaCounterId` очищает значение.
 */
export interface UpdateProjectRequest {
  name?: string
  defaultLocale?: string
  revalidateUrl?: string
  siteUrl?: string
  metrikaCounterId?: string
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
