import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import type { PrismaService } from '../common/prisma.service.js';
import { ManifestService } from '../manifest/manifest.service.js';
import type { BlockManifest } from '@crito/contract';
import { PagesService } from './pages.service.js';
import type { RevalidateService } from './revalidate.service.js';

const manifest: BlockManifest = {
  project: 'rucode',
  version: '1',
  blocks: [
    {
      type: 'info',
      title: 'Info',
      category: 'content',
      schemaVersion: 1,
      readonly: false,
      aliases: [],
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          body: { type: 'string', 'x-field': 'richtext' },
          cta: { type: 'string', 'x-field': 'link' },
        },
      },
    },
    { type: 'legacy', title: 'Legacy', category: 'content', schemaVersion: 1, readonly: true, aliases: [] },
  ],
};

const storedBlocks = [
  { id: 'a', type: 'info', order: 10, enabled: true, data: { body: '<p>старое</p>' } },
  { id: 'l', type: 'legacy', order: 20, enabled: true, data: { html: '<b>как было</b>', n: 1 } },
];

interface Saved {
  /** Что ушло в `draft` при сохранении (Prisma.DbNull, если черновик снят). */
  draft?: { blocks: unknown } | unknown;
  /** Данные публикации (updateMany внутри транзакции). */
  published?: { blocks?: unknown; version?: unknown };
  revision?: { version: number; blocks: unknown };
  notified: number;
}

function setup(stored: { draft?: unknown; draftUpdatedAt?: Date | null } = {}) {
  const saved: Saved = { notified: 0 };
  const project = {
    id: 'p1',
    slug: 'rucode',
    revalidateUrl: null,
    revalidateSecret: null,
    manifest: JSON.stringify(manifest),
    manifestHash: 'hash',
  };
  const page = {
    id: 'pg',
    version: 1,
    blocks: storedBlocks,
    meta: null,
    headerConfig: null,
    noFooterSpacing: false,
    deletedAt: null,
    draft: stored.draft ?? null,
    draftUpdatedAt: stored.draftUpdatedAt ?? null,
    draftById: null,
    draftBy: null,
    project,
  };
  const tx = {
    page: {
      updateMany: async ({ data }: { data: { blocks: unknown } }) => {
        saved.published = data;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ version: 2 }),
    },
    pageRevision: {
      create: async ({ data }: { data: { version: number; blocks: unknown } }) => {
        saved.revision = data;
        return {};
      },
    },
  };
  const prisma = {
    project: { findUnique: async () => project },
    page: {
      findFirst: async () => page,
      updateMany: async ({ data }: { data: { draft: unknown } }) => {
        saved.draft = data.draft;
        return { count: 1 };
      },
    },
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;

  const access = new AccessService();
  const service = new PagesService(
    prisma,
    access,
    new ManifestService(prisma),
    {
      notify: async () => {
        saved.notified++;
      },
    } as unknown as RevalidateService,
  );
  return { service, saved };
}

/** Блоки, ушедшие в черновик. */
const draftBlocks = (saved: Saved) => (saved.draft as { blocks: unknown }).blocks;

const fullAccess: Principal = {
  userId: 'u1',
  email: 'a@x',
  isSuperAdmin: false,
  grants: [{ project: 'rucode', scope: 'project' }],
};
const pageOnly: Principal = {
  userId: 'u2',
  email: 'b@x',
  isSuperAdmin: false,
  grants: [{ project: 'rucode', scope: 'pages', pageIds: ['pg'] }],
};

const dto = (blocks: unknown[]) => ({ version: 1, blocks }) as Parameters<PagesService['update']>[3];
const info = (data: unknown) => ({ id: 'a', type: 'info', order: 10, enabled: true, data });

describe('PagesService.update: очистка данных', () => {
  it('очищает rich-text перед записью в БД', async () => {
    const { service, saved } = setup();
    await service.update(fullAccess, 'rucode', 'pg', dto([
      info({ body: '<p>ок</p><script>alert(1)</script><img src=x onerror=alert(2)>', text: '<b>не rich-text</b>' }),
      storedBlocks[1],
    ]));
    const blocks = draftBlocks(saved) as Array<{ id: string; data: Record<string, string> }>;
    expect(blocks[0]?.data.body).toBe('<p>ок</p>');
    // поля без x-field: richtext не трогаем
    expect(blocks[0]?.data.text).toBe('<b>не rich-text</b>');
  });

  it('отклоняет javascript: в полях link', async () => {
    const { service } = setup();
    await expect(
      service.update(fullAccess, 'rucode', 'pg', dto([info({ cta: 'javascript:alert(1)' }), storedBlocks[1]])),
    ).rejects.toMatchObject({ response: { message: 'Недопустимые адреса в полях' } });
  });
});

describe('PagesService.update: блоки без схемы', () => {
  it('редактор отдельных страниц не может менять их содержимое', async () => {
    const { service } = setup();
    const tampered = { ...storedBlocks[1], data: { html: '<img src=x onerror=alert(1)>', n: 1 } };
    await expect(service.update(pageOnly, 'rucode', 'pg', dto([info({}), tampered]))).rejects.toThrow('нет схемы');
  });

  it('редактор отдельных страниц может переставлять и скрывать такие блоки', async () => {
    const { service, saved } = setup();
    const hidden = { ...storedBlocks[1], enabled: false, order: 5 };
    await service.update(pageOnly, 'rucode', 'pg', dto([hidden, info({ body: '<p>новое</p>' })]));
    expect((draftBlocks(saved) as Array<{ id: string }>).map((b) => b.id)).toEqual(['l', 'a']);
  });

  it('ключи данных в другом порядке не считаются изменением', async () => {
    const { service } = setup();
    const reordered = { ...storedBlocks[1], data: { n: 1, html: '<b>как было</b>' } };
    await expect(service.update(pageOnly, 'rucode', 'pg', dto([info({}), reordered]))).resolves.toBeDefined();
  });

  it('новый блок без схемы допустим только с пустыми данными', async () => {
    const { service } = setup();
    const fresh = (data: unknown) => ({ id: 'new', type: 'legacy', order: 30, enabled: true, data });
    await expect(service.update(pageOnly, 'rucode', 'pg', dto([info({}), storedBlocks[1], fresh({})]))).resolves.toBeDefined();
    await expect(service.update(pageOnly, 'rucode', 'pg', dto([info({}), storedBlocks[1], fresh({ x: '<script>' })]))).rejects.toThrow('нет схемы');
  });

  it('при доступе ко всему проекту содержимое можно менять (импорт, оператор)', async () => {
    const { service, saved } = setup();
    const changed = { ...storedBlocks[1], data: { html: '<b>новое</b>' } };
    await service.update(fullAccess, 'rucode', 'pg', dto([info({}), changed]));
    expect((draftBlocks(saved) as Array<{ data: unknown }>)[1]?.data).toEqual({ html: '<b>новое</b>' });
  });
});

describe('PagesService: черновик и публикация', () => {
  it('сохранение пишет черновик, но не публикует: ни версии, ни истории, ни вебхука', async () => {
    const { service, saved } = setup();
    await service.update(fullAccess, 'rucode', 'pg', dto([info({ text: 'правка' }), storedBlocks[1]]));
    expect(draftBlocks(saved)).toHaveLength(2);
    expect(saved.published).toBeUndefined();
    expect(saved.revision).toBeUndefined();
    expect(saved.notified).toBe(0);
  });

  it('содержимое, равное опубликованному, снимает черновик', async () => {
    const { service, saved } = setup({ draft: { blocks: [] }, draftUpdatedAt: new Date() });
    await service.update(fullAccess, 'rucode', 'pg', dto(storedBlocks));
    // Prisma.DbNull, а не объект с блоками
    expect((saved.draft as { blocks?: unknown }).blocks).toBeUndefined();
  });

  it('публикация переносит черновик в опубликованное, создаёт версию и вызывает вебхук', async () => {
    const draft = {
      blocks: [{ id: 'a', type: 'info', order: 10, enabled: true, data: { text: 'из черновика' } }, storedBlocks[1]],
      meta: null,
      headerConfig: null,
      noFooterSpacing: false,
    };
    const { service, saved } = setup({ draft, draftUpdatedAt: new Date() });
    await service.publish(fullAccess, 'rucode', 'pg', 1);
    const published = (saved.published?.blocks ?? []) as Array<{ data: unknown }>;
    expect(published[0]?.data).toEqual({ text: 'из черновика' });
    expect(saved.revision).toMatchObject({ version: 2 });
    expect(saved.notified).toBe(1);
  });

  it('публиковать без черновика нечего', async () => {
    const { service } = setup();
    await expect(service.publish(fullAccess, 'rucode', 'pg', 1)).rejects.toThrow('Нет изменений для публикации');
  });

  it('редактор отдельных страниц сравнивает блоки без схемы с черновиком, а не с опубликованным', async () => {
    const changedByOwner = { ...storedBlocks[1], data: { html: '<b>правка владельца</b>' } };
    const draft = { blocks: [storedBlocks[0], changedByOwner], meta: null, headerConfig: null, noFooterSpacing: false };
    const { service } = setup({ draft, draftUpdatedAt: new Date() });
    await expect(
      service.update(pageOnly, 'rucode', 'pg', dto([info({ text: 'ещё правка' }), changedByOwner])),
    ).resolves.toBeDefined();
  });
});
