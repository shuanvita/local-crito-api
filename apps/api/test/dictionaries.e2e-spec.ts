import { client, createTestContext, startWebhookRecorder } from './helpers.js';
import type { TestContext, WebhookRecorder } from './helpers.js';

/** Общий справочник «Регионы». У файла свои проекты, чтобы не зависеть от других сценариев. */
const PROJECT = 'dictproj';
const OTHER = 'dictother';

let ctx: TestContext;
let http: ReturnType<typeof client>;
let webhook: WebhookRecorder;
let otherWebhook: WebhookRecorder;
let admin: string;
let owner: string;
let pagesOnly: string;
let otherOwner: string;

const base = '/dictionaries/regions';
const publicUrl = '/public/dictionaries/regions';
const legacyPublicUrl = (project = PROJECT) => `/public/${project}/dictionaries/regions`;

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  webhook = await startWebhookRecorder();
  otherWebhook = await startWebhookRecorder();
  admin = await ctx.login('dict-admin@e2e.test', { superAdmin: true });
  owner = await ctx.login('dict-owner@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });
  pagesOnly = await ctx.login('dict-pages@e2e.test', {
    grants: [{ project: PROJECT, scope: 'pages', pageIds: ['any'] }],
  });
  otherOwner = await ctx.login('dict-other@e2e.test', { grants: [{ project: OTHER, scope: 'project' }] });

  await http
    .post('/projects', admin)
    .send({ slug: PROJECT, name: 'Dict', revalidateUrl: webhook.url, revalidateSecret: 's3cret' })
    .expect(201);
  await http
    .post('/projects', admin)
    .send({ slug: OTHER, name: 'Other', revalidateUrl: otherWebhook.url, revalidateSecret: 'other-secret' })
    .expect(201);
});

afterAll(async () => {
  await ctx.app.close();
  await webhook.close();
  await otherWebhook.close();
});

describe('общий справочник регионов', () => {
  let moscow: string;

  it('пустой справочник: список и публичный ответ', async () => {
    expect((await http.get(base, admin).expect(200)).body).toEqual([]);
    expect((await http.get(publicUrl).expect(200)).body).toEqual([]);
  });

  it('создание: без sortOrder регион встаёт в конец, сайт сразу получает список в этом порядке', async () => {
    const first = await http.post(base, admin).send({ value: 77, label: '  г. Москва ' }).expect(201);
    moscow = first.body.id;
    expect(first.body).toMatchObject({ value: 77, label: 'г. Москва', sortOrder: 10 });
    await http.post(base, admin).send({ value: 1, label: 'Республика Адыгея' }).expect(201);
    await http.post(base, admin).send({ value: 50, label: 'Московская область', sortOrder: 5 }).expect(201);

    const publicList = await http.get(publicUrl).expect(200);
    expect(publicList.body).toEqual([
      { value: 50, label: 'Московская область' },
      { value: 77, label: 'г. Москва' },
      { value: 1, label: 'Республика Адыгея' },
    ]);
    expect(publicList.headers['cache-control']).toBe('public, no-cache');
    expect(publicList.headers.etag).toBeTruthy();
  });

  it('ETag: повторный запрос с If-None-Match даёт 304', async () => {
    const first = await http.get(publicUrl).expect(200);
    await http.get(publicUrl).set('If-None-Match', first.headers.etag as string).expect(304);
  });

  it('справочник общий: любой проект получает один и тот же список, старый адрес тоже работает', async () => {
    const shared = (await http.get(publicUrl).expect(200)).body;
    expect(shared).toHaveLength(3);
    expect((await http.get(legacyPublicUrl()).expect(200)).body).toEqual(shared);
    expect((await http.get(legacyPublicUrl(OTHER)).expect(200)).body).toEqual(shared);
    await http.get(legacyPublicUrl('nope')).expect(404);
  });

  it('идентификатор региона уникален глобально (409)', async () => {
    await http.post(base, admin).send({ value: 77, label: 'Дубль' }).expect(409);
  });

  it('правка: название и порядок; смена value на занятый даёт 409', async () => {
    const updated = await http.patch(`${base}/${moscow}`, admin).send({ label: 'Москва', sortOrder: 1 }).expect(200);
    expect(updated.body).toMatchObject({ id: moscow, value: 77, label: 'Москва', sortOrder: 1 });
    await http.patch(`${base}/${moscow}`, admin).send({ value: 1 }).expect(409);
    // то же значение самому себе конфликтом не считается
    await http.patch(`${base}/${moscow}`, admin).send({ value: 77 }).expect(200);
    expect((await http.get(publicUrl).expect(200)).body[0]).toEqual({ value: 77, label: 'Москва' });
  });

  it('валидация: пустое название, нецелое и отрицательное значение, слишком большое число', async () => {
    await http.post(base, admin).send({ value: 3, label: '   ' }).expect(400);
    await http.post(base, admin).send({ value: 1.5, label: 'X' }).expect(400);
    await http.post(base, admin).send({ value: -1, label: 'X' }).expect(400);
    await http.post(base, admin).send({ value: 2_147_483_648, label: 'X' }).expect(400);
    await http.post(base, admin).send({ label: 'X' }).expect(400);
  });

  it('права: без входа 401; читать может любой вошедший, править только администратор', async () => {
    await http.get(base).expect(401);
    for (const token of [owner, pagesOnly, otherOwner]) {
      expect((await http.get(base, token).expect(200)).body).toHaveLength(3);
    }

    // доступ ко всему проекту справочник не открывает: он общий для всех сайтов
    for (const token of [owner, pagesOnly, otherOwner]) {
      await http.post(base, token).send({ value: 9, label: 'X' }).expect(403);
      await http.patch(`${base}/${moscow}`, token).send({ label: 'Взлом' }).expect(403);
      await http.delete(`${base}/${moscow}`, token).expect(403);
    }
    await http.post(base).send({ value: 9, label: 'X' }).expect(401);

    // отказ не меняет данные
    expect((await http.get(publicUrl).expect(200)).body[0]).toEqual({ value: 77, label: 'Москва' });
  });

  it('несуществующий регион: 404', async () => {
    await http.patch(`${base}/nope`, admin).send({ label: 'X' }).expect(404);
    await http.delete(`${base}/nope`, admin).expect(404);
  });

  it('изменение вызывает вебхуки всех проектов, у которых он настроен', async () => {
    const before = webhook.calls.length;
    const otherBefore = otherWebhook.calls.length;
    await http.post(base, admin).send({ value: 200, label: 'Для вебхука' }).expect(201);
    await vi.waitFor(() => {
      expect(webhook.calls.length).toBeGreaterThan(before);
      expect(otherWebhook.calls.length).toBeGreaterThan(otherBefore);
    });
    expect(webhook.calls.at(-1)).toMatchObject({ method: 'POST', secret: 's3cret' });
    expect(otherWebhook.calls.at(-1)).toMatchObject({ method: 'POST', secret: 'other-secret' });
  });

  it('удаление окончательное: регион пропадает из списка и с сайта', async () => {
    await http.delete(`${base}/${moscow}`, admin).expect(204);
    await http.delete(`${base}/${moscow}`, admin).expect(404);
    const values = (await http.get(publicUrl).expect(200)).body.map((region: { value: number }) => region.value);
    expect(values).not.toContain(77);
  });
});

describe('GET /me', () => {
  it('отдаёт признак администратора', async () => {
    expect((await http.get('/me', admin).expect(200)).body).toMatchObject({
      email: 'dict-admin@e2e.test',
      isSuperAdmin: true,
    });
    expect((await http.get('/me', owner).expect(200)).body).toMatchObject({ isSuperAdmin: false });
    await http.get('/me').expect(401);
  });
});

describe('сводка проекта на главной', () => {
  it('число страниц и дата изменения; при доступе к отдельным страницам считаются только их', async () => {
    const stats = 'stats';
    await http.post('/projects', admin).send({ slug: stats, name: 'Stats' }).expect(201);
    expect((await http.get(`/projects/${stats}`, admin).expect(200)).body).toMatchObject({
      pagesCount: 0,
      lastChangedAt: null,
    });

    const prisma = ctx.prisma;
    const project = await prisma.project.findUniqueOrThrow({ where: { slug: stats } });
    const [a, b, deleted] = await Promise.all(
      ['/a', '/b', '/gone'].map((slug) => prisma.page.create({ data: { projectId: project.id, slug } })),
    );
    await prisma.page.update({ where: { id: deleted!.id }, data: { deletedAt: new Date() } });

    const full = await http.get(`/projects/${stats}`, admin).expect(200);
    expect(full.body.pagesCount).toBe(2);
    expect(typeof full.body.lastChangedAt).toBe('string');

    const limited = await ctx.login('dict-stats@e2e.test', {
      grants: [{ project: stats, scope: 'pages', pageIds: [a!.id, deleted!.id] }],
    });
    const mine = await http.get('/projects', limited).expect(200);
    expect(mine.body).toHaveLength(1);
    // корзина не считается, чужая страница b не видна
    expect(mine.body[0]).toMatchObject({ slug: stats, fullAccess: false, pagesCount: 1 });
    expect(b).toBeTruthy();
  });

  it('slug dictionaries зарезервирован за общими справочниками', async () => {
    await http.post('/projects', admin).send({ slug: 'dictionaries', name: 'X' }).expect(400);
  });
});
