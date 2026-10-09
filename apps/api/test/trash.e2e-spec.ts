import type { BlockManifest } from '@crito/contract';
import sharp from 'sharp';
import { client, createTestContext, startWebhookRecorder } from './helpers.js';
import type { TestContext, WebhookRecorder } from './helpers.js';

/** Корзина: мягкое удаление страниц. У файла свой проект, чтобы не зависеть от других сценариев. */
const PROJECT = 'trashproj';

const manifest: BlockManifest = {
  project: PROJECT,
  version: 'e2e',
  blocks: [
    {
      type: 'info',
      title: 'Info',
      category: 'content',
      schemaVersion: 1,
      readonly: false,
      aliases: [],
      schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
    {
      type: 'gallery',
      title: 'Gallery',
      category: 'media',
      schemaVersion: 1,
      readonly: false,
      aliases: [],
      schema: { type: 'object', properties: { src: { type: 'string', 'x-field': 'image' } }, required: ['src'] },
    },
  ],
};

const infoBlock = (title = 'Привет') => ({ id: 'b1', type: 'info', order: 10, enabled: true, data: { title } });
const png = () => sharp({ create: { width: 6, height: 6, channels: 3, background: '#112233' } }).png().toBuffer();

let ctx: TestContext;
let http: ReturnType<typeof client>;
let webhook: WebhookRecorder;
let admin: string;
let owner: string;
let editor: string;
let pageId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  webhook = await startWebhookRecorder();
  admin = await ctx.login('trash-admin@e2e.test', { superAdmin: true });
  owner = await ctx.login('trash-owner@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });

  const created = await http.post('/projects', admin).send({ slug: PROJECT, name: 'Trash', revalidateUrl: webhook.url, revalidateSecret: 's3cret' }).expect(201);
  await http.put(`/projects/${PROJECT}/manifest`).set('x-ci-key', created.body.ciKey).send(manifest).expect(200);

  const page = await http
    .post(`/projects/${PROJECT}/pages`, admin)
    .send({ slug: '/trash-me', meta: { title: 'В корзину' }, blocks: [infoBlock('Живая страница')] })
    .expect(201);
  pageId = page.body.id;
  // вторая версия: проверяем, что история переживает удаление
  await http
    .put(`/projects/${PROJECT}/pages/${pageId}`, admin)
    .send({ version: 1, blocks: [infoBlock('Вторая версия')], meta: { title: 'В корзину' } })
    .expect(200);

  editor = await ctx.login('trash-editor@e2e.test', { grants: [{ project: PROJECT, scope: 'pages', pageIds: [pageId] }] });
});

afterAll(async () => {
  await ctx.app.close();
  await webhook.close();
});

describe('удаление страницы', () => {
  it('удалять может только тот, у кого доступ ко всему проекту', async () => {
    await http.delete(`/projects/${PROJECT}/pages/${pageId}`, editor).expect(403);
    await http.delete(`/projects/${PROJECT}/pages/${pageId}`).expect(401);
    await http.get(`/public/${PROJECT}/pages/trash-me`).expect(200);
  });

  it('убирает страницу с сайта и из списка, но не из БД, и сбрасывает кэш сайта', async () => {
    webhook.calls.length = 0;
    await http.delete(`/projects/${PROJECT}/pages/${pageId}`, owner).expect(204);

    await http.get(`/public/${PROJECT}/pages/trash-me`).expect(404);
    const list = await http.get(`/projects/${PROJECT}/pages`, admin).expect(200);
    expect(list.body.map((p: { slug: string }) => p.slug)).not.toContain('/trash-me');

    const row = await ctx.prisma.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedById).not.toBeNull();
    expect(await ctx.prisma.pageRevision.count({ where: { pageId } })).toBe(2);

    await vi.waitFor(() => expect(webhook.calls.length).toBeGreaterThanOrEqual(1));
  });

  it('повторное удаление уже удалённой страницы это 404', async () => {
    await http.delete(`/projects/${PROJECT}/pages/${pageId}`, owner).expect(404);
  });
});

describe('корзина', () => {
  it('показывает удалённые страницы с автором удаления только при доступе ко всему проекту', async () => {
    const trash = await http.get(`/projects/${PROJECT}/pages/trash`, owner).expect(200);
    const item = trash.body.find((p: { id: string }) => p.id === pageId);
    expect(item).toMatchObject({ slug: '/trash-me', version: 2, meta: { title: 'В корзину' } });
    expect(item.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(item.deletedBy.email).toBe('trash-owner@e2e.test');

    await http.get(`/projects/${PROJECT}/pages/trash`, editor).expect(403);
    await http.get(`/projects/${PROJECT}/pages/trash`).expect(401);
  });

  it('удалённую страницу нельзя редактировать и откатывать; историю видит только полный доступ', async () => {
    const page = await http.get(`/projects/${PROJECT}/pages/${pageId}`, owner).expect(200);
    expect(page.body.deletedAt).not.toBeNull();

    // 409 с понятным объяснением, а не общий «страница изменена другим пользователем»
    const save = await http.put(`/projects/${PROJECT}/pages/${pageId}`, owner).send({ version: 2, blocks: [] }).expect(409);
    expect(save.body.message).toContain('в корзине');
    const rollback = await http.post(`/projects/${PROJECT}/pages/${pageId}/revisions/1/restore`, owner).expect(409);
    expect(rollback.body.message).toContain('в корзине');

    const revisions = await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions`, owner).expect(200);
    expect(revisions.body).toHaveLength(2);

    // редактор отдельных страниц удалённой страницы «не видит»
    await http.get(`/projects/${PROJECT}/pages/${pageId}`, editor).expect(404);
    await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions`, editor).expect(404);
  });

  it('адрес занят, пока страница в корзине', async () => {
    const res = await http.post(`/projects/${PROJECT}/pages`, owner).send({ slug: '/trash-me', blocks: [] }).expect(409);
    expect(res.body.message).toContain('в корзине');
    expect(res.body.message).toContain('/trash-me');
  });

  it('файл, который используется страницей из корзины, удалить нельзя', async () => {
    const media = await http.post(`/projects/${PROJECT}/media`, admin).attach('file', await png(), 'trash-image.png').expect(201);
    const holder = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/trash-holder', blocks: [{ id: 'g', type: 'gallery', order: 1, enabled: true, data: { src: media.body.url } }] })
      .expect(201);
    await http.delete(`/projects/${PROJECT}/pages/${holder.body.id}`, admin).expect(204);

    const res = await http.delete(`/projects/${PROJECT}/media/${media.body.id}`, admin).expect(409);
    expect(res.body.pages).toEqual(['/trash-holder (в корзине)']);

    // после окончательного удаления страницы файл свободен
    await http.delete(`/projects/${PROJECT}/pages/${holder.body.id}/purge`, admin).expect(204);
    await http.delete(`/projects/${PROJECT}/media/${media.body.id}`, admin).expect(204);
  });
});

describe('восстановление и окончательное удаление', () => {
  it('восстановление возвращает страницу на сайт в прежнем состоянии, история цела', async () => {
    await http.post(`/projects/${PROJECT}/pages/${pageId}/restore`, editor).expect(403);

    webhook.calls.length = 0;
    const restored = await http.post(`/projects/${PROJECT}/pages/${pageId}/restore`, owner).expect(201);
    expect(restored.body).toMatchObject({ id: pageId, slug: '/trash-me', version: 2, deletedAt: null });

    const pub = await http.get(`/public/${PROJECT}/pages/trash-me`).expect(200);
    expect(pub.body.version).toBe(2);
    expect(pub.body.blocks[0].data.title).toBe('Вторая версия');

    const trash = await http.get(`/projects/${PROJECT}/pages/trash`, owner).expect(200);
    expect(trash.body.map((p: { id: string }) => p.id)).not.toContain(pageId);
    expect(await ctx.prisma.pageRevision.count({ where: { pageId } })).toBe(2);
    await vi.waitFor(() => expect(webhook.calls.length).toBeGreaterThanOrEqual(1));

    // страница снова редактируется, редактор с правом на неё снова её видит
    await http.get(`/projects/${PROJECT}/pages/${pageId}`, editor).expect(200);
    await http
      .put(`/projects/${PROJECT}/pages/${pageId}`, editor)
      .send({ version: 2, blocks: [infoBlock('После восстановления')] })
      .expect(200);

    // повторное восстановление живой страницы это конфликт
    await http.post(`/projects/${PROJECT}/pages/${pageId}/restore`, owner).expect(409);
  });

  it('окончательное удаление: только из корзины и с историей; адрес освобождается', async () => {
    await http.delete(`/projects/${PROJECT}/pages/${pageId}/purge`, owner).expect(409); // страница живая
    await http.delete(`/projects/${PROJECT}/pages/${pageId}`, owner).expect(204);

    await http.delete(`/projects/${PROJECT}/pages/${pageId}/purge`, editor).expect(403);
    await http.delete(`/projects/${PROJECT}/pages/${pageId}/purge`, owner).expect(204);

    expect(await ctx.prisma.page.count({ where: { id: pageId } })).toBe(0);
    expect(await ctx.prisma.pageRevision.count({ where: { pageId } })).toBe(0);
    await http.get(`/projects/${PROJECT}/pages/${pageId}`, owner).expect(404);
    await http.delete(`/projects/${PROJECT}/pages/${pageId}/purge`, owner).expect(404);

    // адрес снова свободен
    await http.post(`/projects/${PROJECT}/pages`, owner).send({ slug: '/trash-me', blocks: [infoBlock()] }).expect(201);
  });
});

describe('права в ответах проекта', () => {
  it('проект сообщает, есть ли у пользователя доступ ко всему проекту', async () => {
    const asOwner = await http.get(`/projects/${PROJECT}`, owner).expect(200);
    const asEditor = await http.get(`/projects/${PROJECT}`, editor).expect(200);
    const asAdmin = await http.get(`/projects/${PROJECT}`, admin).expect(200);
    expect([asOwner.body.fullAccess, asEditor.body.fullAccess, asAdmin.body.fullAccess]).toEqual([true, false, true]);

    const list = await http.get('/projects', editor).expect(200);
    expect(list.body.map((p: { slug: string; fullAccess: boolean }) => [p.slug, p.fullAccess])).toEqual([[PROJECT, false]]);
  });
});
