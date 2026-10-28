/**
 * Права пользователей из LMS. LMS передаёт группы и роль (заголовки `X-Cms-User-Groups`, `X-Cms-User-Role`),
 * а что они значат для проекта, задаётся здесь: группа выбирает проект, роль профиль прав внутри него.
 */

/** Профиль роли в проекте: что может пользователь с такой ролью LMS. */
export interface LmsRoleProfile {
  /** Значение `X-Cms-User-Role`: произвольная строка LMS, регистр не важен. */
  role: string
  /** Весь проект или только выбранные страницы. */
  scope: 'project' | 'pages'
  /** Для `scope=pages`: id страниц; для `project` пусто. */
  pageIds: string[]
  /** Раздел «Заявки» (персональные данные). */
  requests: boolean
}

/** `GET`/`PUT /projects/:project/lms-access` (суперадмин). */
export interface LmsAccess {
  /** Id групп LMS, чьи участники попадают в этот проект. */
  groups: string[]
  /** Роль без профиля ничего не даёт: доступ закрыт по умолчанию. */
  roles: LmsRoleProfile[]
}
