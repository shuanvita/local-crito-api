/**
 * Справочники проекта: `GET|POST /projects/:project/dictionaries/regions`,
 * `PATCH|DELETE /projects/:project/dictionaries/regions/:id`.
 */

/** Регион в админке. */
export interface RegionItem {
  id: string
  /** Числовой идентификатор региона во внешней системе (форма участия); уникален в проекте. */
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
 * Регион в публичном API: `GET /public/:project/dictionaries/regions` отдаёт массив таких элементов
 * в заданном порядке. Форма совпадает с `RegionOption` сайта rucode, поэтому он может подставить ответ как есть.
 */
export interface PublicRegion {
  value: number
  label: string
}
