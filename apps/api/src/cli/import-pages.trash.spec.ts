import { importPages } from './import-pages.js';
import type { ExportFile, ImportDeps } from './import-pages.js';

const principal = { userId: 'u1', email: 'i@x', isSuperAdmin: true, grants: [] };
const data: ExportFile = {
  project: 'rucode',
  pages: [{ slug: '/index', blocks: [{ id: 'b1', type: 'faq', order: 10, enabled: true, data: {} }] }],
};

describe('importPages: страницы в корзине', () => {
  it.each([false, true])('не трогает страницу в корзине (overwrite=%s) и объясняет почему', async (overwrite) => {
    const calls = { create: 0, update: 0 };
    const deps: ImportDeps = {
      principal,
      findPage: async () => ({ id: 'p1', version: 3, deleted: true }),
      validateBlocks: async () => {},
      create: async () => void calls.create++,
      update: async () => void calls.update++,
    };

    const results = await importPages(deps, data, { project: 'rucode', dryRun: false, overwrite });

    expect(results[0]?.status).toBe('skipped');
    expect(results[0]?.message).toContain('в корзине');
    expect(calls).toEqual({ create: 0, update: 0 });
  });
});
