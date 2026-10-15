import type { ManifestHeaderConfig } from '@crito/contract'

/** Значение пункта «ничего не выбрано»: Reka UI не принимает пустую строку как значение пункта. */
export const HEADER_CONFIG_DEFAULT = '__default__'

export interface HeaderConfigItem {
  label: string
  value: string
  description?: string
}

/**
 * Пункты выбора шапки и футера. Текущий ключ, которого нет в списке манифеста (старая страница),
 * остаётся выбираемым с пометкой: иначе при открытии страницы он молча сбросился бы.
 */
export function headerConfigItems(configs: ManifestHeaderConfig[], current: string): HeaderConfigItem[] {
  const items: HeaderConfigItem[] = [
    { label: 'По умолчанию', value: HEADER_CONFIG_DEFAULT, description: 'Как на сайте, если вариант не задан' },
    ...configs.map(config => ({ label: config.title, value: config.key, description: config.description }))
  ]
  const known = current === '' || configs.some(config => config.key === current)
  if (!known) items.push({ label: `${current} (нет в списке)`, value: current })
  return items
}

export const toHeaderConfigValue = (draft: string) => draft === '' ? HEADER_CONFIG_DEFAULT : draft
export const fromHeaderConfigValue = (value: string) => value === HEADER_CONFIG_DEFAULT ? '' : value
