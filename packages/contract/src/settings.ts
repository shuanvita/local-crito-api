/**
 * Общие настройки сайта (например, пункты меню «Мероприятия»), одни на проект. Форму задаёт сайт
 * в манифесте (`settingsSchema`). Версий нет: сохранение применяется сразу и сбрасывает кэш сайта.
 */
export type SiteSettings = Record<string, unknown>

/** `GET /projects/:project/settings` и ответ на `PUT` (право на весь проект). `null`: настройки ещё не заданы. */
export interface ProjectSettingsResponse {
  settings: SiteSettings | null
}

/** `PUT /projects/:project/settings`. */
export interface UpdateSettingsRequest {
  settings: SiteSettings
}
