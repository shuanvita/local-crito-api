/**
 * Общие справочники в боковом меню. Они не относятся к проекту: доступны с главной и из любого проекта.
 * Новый справочник добавляется здесь и отдельной страницей `pages/dictionaries/<key>.vue`.
 */
export interface DictionaryEntry {
  key: string
  label: string
  icon: string
}

export const DICTIONARIES: DictionaryEntry[] = [
  { key: 'regions', label: 'Регионы', icon: 'i-lucide-map-pinned' }
]
