/**
 * Справочники проекта в боковом меню. Новый справочник добавляется здесь и отдельной страницей
 * `pages/[project]/dictionaries/<key>.vue`.
 */
export interface DictionaryEntry {
  key: string
  label: string
  icon: string
}

export const DICTIONARIES: DictionaryEntry[] = [
  { key: 'regions', label: 'Регионы', icon: 'i-lucide-map-pinned' }
]
