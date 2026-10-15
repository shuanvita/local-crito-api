import { ManifestService } from './manifest.service.js';
import type { BlockManifest } from '@crito/contract';
import type { PrismaService } from '../common/prisma.service.js';

const manifest: BlockManifest = {
  project: 'rucode',
  version: '2026-10-09',
  blocks: [
    {
      type: 'faq',
      title: 'FAQ',
      category: 'faq',
      schemaVersion: 1,
      readonly: false,
      aliases: [],
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { heading: { type: 'string' }, content: { type: 'string', 'x-field': 'richtext' } },
              required: ['heading', 'content'],
            },
          },
        },
        required: ['items'],
      },
    },
    { type: 'legacy', title: 'Legacy', category: 'content', schemaVersion: 1, readonly: true, aliases: [] },
  ],
};

function createService(stored: BlockManifest | null = manifest) {
  const prisma = {
    project: {
      findUnique: async () => ({ manifest: stored ? JSON.stringify(stored) : null, manifestHash: stored ? 'hash-1' : null }),
    },
  } as unknown as PrismaService;
  return new ManifestService(prisma);
}

const block = (overrides: Record<string, unknown>) => ({
  id: 'b1',
  type: 'faq',
  order: 10,
  enabled: true,
  data: { items: [] },
  ...overrides,
});

describe('ManifestService.validateBlocks', () => {
  it('пропускает валидные блоки, включая readonly без проверки данных', async () => {
    const service = createService();
    await expect(
      service.validateBlocks('rucode', [block({}), block({ id: 'b2', type: 'legacy', data: { any: 1 } })]),
    ).resolves.toBeUndefined();
  });

  it('отклоняет неизвестный type', async () => {
    await expect(createService().validateBlocks('rucode', [block({ type: 'nope' })])).rejects.toThrow(
      'Блоки не прошли проверку',
    );
  });

  it('отклоняет данные, не соответствующие схеме', async () => {
    const service = createService();
    await expect(
      service.validateBlocks('rucode', [block({ data: { items: [{ heading: 1 }] } })]),
    ).rejects.toMatchObject({ response: { errors: expect.any(Array) } });
  });

  it('отклоняет повторяющиеся id', async () => {
    await expect(createService().validateBlocks('rucode', [block({}), block({})])).rejects.toThrow();
  });

  it('возвращает 409, если манифест ещё не загружен', async () => {
    await expect(createService(null).validateBlocks('rucode', [block({})])).rejects.toThrow(
      'Манифест блоков проекта ещё не загружен',
    );
  });
});

describe('ManifestService.set: поля каталога блоков', () => {
  function createSetService() {
    const update = vi.fn(async () => ({}));
    const prisma = { project: { update } } as unknown as PrismaService;
    return { service: new ManifestService(prisma), update };
  }
  const withBlock = (extra: Record<string, unknown>): BlockManifest => ({
    ...manifest,
    blocks: [{ ...manifest.blocks[1]!, ...extra }],
  });

  it('сохраняет origin, group, description, preview и pages', async () => {
    const { service, update } = createSetService();
    await service.set(
      'rucode',
      withBlock({
        origin: 'library',
        group: 'AI Champ',
        description: 'Устаревший блок',
        preview: '/previews/legacy.png',
        pages: ['/ai-champ/*'],
      }),
    );
    expect(update).toHaveBeenCalledOnce();
  });

  it('сохраняет headerConfigs', async () => {
    const { service, update } = createSetService();
    await service.set('rucode', {
      ...manifest,
      headerConfigs: [{ key: 'home', title: 'Главная' }, { key: 'champ', title: 'Чемпионат', description: 'С баннером' }],
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it.each([
    ['не массив', 'home'],
    ['элемент не объект', ['home']],
    ['пустой key', [{ key: '', title: 'A' }]],
    ['key с пробелами по краям', [{ key: ' home', title: 'A' }]],
    ['key не строка', [{ key: 1, title: 'A' }]],
    ['пустой title', [{ key: 'home', title: ' ' }]],
    ['description не строка', [{ key: 'home', title: 'A', description: 1 }]],
    ['повтор key', [{ key: 'home', title: 'A' }, { key: 'home', title: 'B' }]],
  ])('отклоняет headerConfigs: %s', async (_name, headerConfigs) => {
    const { service, update } = createSetService();
    await expect(
      service.set('rucode', { ...manifest, headerConfigs } as unknown as BlockManifest),
    ).rejects.toThrow('headerConfigs');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['origin', { origin: 'other' }],
    ['group', { group: 1 }],
    ['pages: не массив', { pages: 'x' }],
    ['pages: не строки', { pages: [1] }],
  ])('отклоняет неверное поле: %s', async (_name, extra) => {
    const { service, update } = createSetService();
    await expect(service.set('rucode', withBlock(extra))).rejects.toThrow('Блок legacy');
    expect(update).not.toHaveBeenCalled();
  });
});
