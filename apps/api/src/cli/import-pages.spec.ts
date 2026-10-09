import { importPages } from './import-pages.js';
import type { ExportFile, ImportDeps } from './import-pages.js';

const principal = { userId: 'u1', email: 'i@x', isSuperAdmin: true, grants: [] };

const block = { id: 'b1', type: 'faq', order: 10, enabled: true, data: { items: [] } };
const file = (...slugs: string[]): ExportFile => ({
  project: 'rucode',
  pages: slugs.map((slug) => ({ slug, blocks: [block] })),
});

function createDeps(overrides: Partial<ImportDeps> & { existing?: Record<string, { id: string; version: number }> } = {}) {
  const calls = { create: [] as string[], update: [] as Array<{ id: string; version: number }> };
  const deps: ImportDeps = {
    principal,
    findPage: async (_project, slug) => overrides.existing?.[slug] ?? null,
    validateBlocks: async () => {},
    create: async (_p, _project, dto) => void calls.create.push(dto.slug),
    update: async (_p, _project, id, dto) => void calls.update.push({ id, version: dto.version }),
    ...overrides,
  };
  return { deps, calls };
}

const options = { project: 'rucode', dryRun: false, overwrite: false };

describe('importPages', () => {
  it('создаёт новые страницы и нормализует slug', async () => {
    const { deps, calls } = createDeps();
    const results = await importPages(deps, file('/index', 'champ'), options);
    expect(results.map((r) => r.status)).toEqual(['created', 'created']);
    expect(calls.create).toEqual(['/index', '/champ']);
  });

  it('пропускает существующие страницы без --overwrite', async () => {
    const { deps, calls } = createDeps({ existing: { '/index': { id: 'p1', version: 3 } } });
    const results = await importPages(deps, file('/index'), options);
    expect(results[0]?.status).toBe('skipped');
    expect(calls.create).toEqual([]);
    expect(calls.update).toEqual([]);
  });

  it('с --overwrite обновляет существующие страницы с их текущей версией', async () => {
    const { deps, calls } = createDeps({ existing: { '/index': { id: 'p1', version: 3 } } });
    const results = await importPages(deps, file('/index'), { ...options, overwrite: true });
    expect(results[0]?.status).toBe('updated');
    expect(calls.update).toEqual([{ id: 'p1', version: 3 }]);
  });

  it('в пробном запуске только проверяет и ничего не пишет', async () => {
    const { deps, calls } = createDeps();
    const results = await importPages(deps, file('/a', '/b'), { ...options, dryRun: true });
    expect(results.map((r) => r.status)).toEqual(['valid', 'valid']);
    expect(calls.create).toEqual([]);
  });

  it('ошибка одной страницы не мешает остальным и описывается подробно', async () => {
    const { deps, calls } = createDeps({
      validateBlocks: async (_project, blocks) => {
        if (blocks === badBlocks) {
          throw Object.assign(new Error('x'), { response: { message: 'Блоки не прошли проверку', errors: ['blocks[0] (nope): неизвестный type'] } });
        }
      },
    });
    const badBlocks = [{ ...block, type: 'nope' }];
    const data: ExportFile = {
      project: 'rucode',
      pages: [{ slug: '/bad', blocks: badBlocks }, { slug: '/good', blocks: [block] }],
    };
    const results = await importPages(deps, data, options);
    expect(results[0]).toMatchObject({ slug: '/bad', status: 'failed' });
    expect(results[0]?.message).toContain('неизвестный type');
    expect(results[1]?.status).toBe('created');
    expect(calls.create).toEqual(['/good']);
  });

  it('недопустимый slug помечается ошибкой', async () => {
    const { deps } = createDeps();
    const results = await importPages(deps, file('/../etc'), options);
    expect(results[0]?.status).toBe('failed');
  });

  it('отклоняет файл другого проекта', async () => {
    const { deps } = createDeps();
    await expect(importPages(deps, { ...file('/a'), project: 'other' }, options)).rejects.toThrow('относится к проекту');
  });
});
