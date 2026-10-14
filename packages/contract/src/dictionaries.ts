/**
 * Общие справочники CMS (не принадлежат проекту): `GET|POST /dictionaries/regions`,
 * `PATCH|DELETE /dictionaries/regions/:id`. Читает любой вошедший пользователь, правит только администратор.
 */

/** Регион в админке. */
export interface RegionItem {
  id: string
  /** Числовой идентификатор региона во внешней системе (форма участия); уникален во всём справочнике. */
  value: number
  /** Название для пользователя. */
  label: string
  /** Позиция в списке: меньше значит выше. */
  sortOrder: number
}

export interface CreateRegionRequest {
  value: number
  label: string
  /** Без значения регион попадает в конец списка. */
  sortOrder?: number
}

export type UpdateRegionRequest = Partial<CreateRegionRequest>

/**
 * Регион в публичном API: `GET /public/dictionaries/regions` отдаёт массив таких элементов
 * в заданном порядке (старый адрес `/public/:project/dictionaries/regions` отдаёт то же самое).
 * Форма совпадает с `RegionOption` сайта rucode, поэтому он может подставить ответ как есть.
 */
export interface PublicRegion {
  value: number
  label: string
}
