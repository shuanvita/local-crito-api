import { planRegionImport } from './import-regions.js';
import type { RegionsFile } from './import-regions.js';

const file = (...regions: Array<[number, string]>): RegionsFile => ({
  project: 'rucode',
  regions: regions.map(([value, label]) => ({ value, label })),
});

describe('planRegionImport', () => {
  it('создаёт новые регионы в порядке файла с шагом 10', () => {
    const plan = planRegionImport([], file([5, 'Б'], [1, 'А']), { overwrite: false });
    expect(plan).toEqual([
      { kind: 'create', value: 5, label: 'Б', sortOrder: 10 },
      { kind: 'create', value: 1, label: 'А', sortOrder: 20 },
    ]);
  });

  it('не трогает существующие регионы без --overwrite', () => {
    const existing = [{ id: 'r1', value: 1, label: 'Правка из админки', sortOrder: 99 }];
    const plan = planRegionImport(existing, file([1, 'А'], [2, 'Б']), { overwrite: false });
    expect(plan.map((action) => action.kind)).toEqual(['skip', 'create']);
  });

  it('обновляет существующие регионы с --overwrite', () => {
    const existing = [{ id: 'r1', value: 1, label: 'Старое', sortOrder: 99 }];
    const plan = planRegionImport(existing, file([1, 'Новое']), { overwrite: true });
    expect(plan).toEqual([{ kind: 'update', id: 'r1', value: 1, label: 'Новое', sortOrder: 10 }]);
  });

  it('пропускает повторы и некорректные записи, остальные импортирует', () => {
    const plan = planRegionImport([], file([1, 'А'], [1, 'Дубль'], [-3, 'Минус'], [2, '  ']), { overwrite: false });
    expect(plan.map((action) => action.kind)).toEqual(['create', 'skip', 'skip', 'skip']);
  });
});
