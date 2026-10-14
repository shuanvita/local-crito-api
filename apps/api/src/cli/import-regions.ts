import type { PublicRegion } from '@crito/contract';

/** Файл со списком регионов: `scripts/rucode/regions.json`. */
export interface RegionsFile {
  /** Откуда взят список. Справочник общий, поэтому при импорте поле не используется. */
  project?: string;
  regions: PublicRegion[];
}

export interface ExistingRegion {
  id: string;
  value: number;
  label: string;
  sortOrder: number;
}

export type RegionAction =
  | { kind: 'create'; value: number; label: string; sortOrder: number }
  | { kind: 'update'; id: string; value: number; label: string; sortOrder: number }
  | { kind: 'skip'; value: number; label: string; reason: string };

const ORDER_STEP = 10;

/**
 * Сопоставляет файл с тем, что уже есть в общем справочнике. Порядок в файле становится порядком в справочнике
 * (шаг 10, чтобы редактор мог вставить регион между соседними). Существующие регионы не трогаются,
 * пока не задан `overwrite`: правки из админки не должны теряться при повторном запуске.
 */
export function planRegionImport(
  existing: ExistingRegion[],
  file: RegionsFile,
  options: { overwrite: boolean },
): RegionAction[] {
  const byValue = new Map(existing.map((region) => [region.value, region]));
  const seen = new Set<number>();

  return file.regions.map((region, index): RegionAction => {
    const sortOrder = (index + 1) * ORDER_STEP;
    const label = region.label.trim();
    if (!Number.isInteger(region.value) || region.value < 0 || !label) {
      return { kind: 'skip', value: region.value, label: region.label, reason: 'некорректная запись' };
    }
    if (seen.has(region.value)) {
      return { kind: 'skip', value: region.value, label, reason: 'повтор идентификатора в файле' };
    }
    seen.add(region.value);

    const current = byValue.get(region.value);
    if (!current) return { kind: 'create', value: region.value, label, sortOrder };
    if (!options.overwrite) {
      return { kind: 'skip', value: region.value, label, reason: 'уже есть; для обновления используйте --overwrite' };
    }
    return { kind: 'update', id: current.id, value: region.value, label, sortOrder };
  });
}
