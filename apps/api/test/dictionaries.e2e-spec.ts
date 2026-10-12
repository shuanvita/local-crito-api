import { client, createTestContext, startWebhookRecorder } from './helpers.js';
import type { TestContext, WebhookRecorder } from './helpers.js';

/** Справочник «Регионы». У файла свои проекты, чтобы не зависеть от других сценариев. */
const PROJECT = 'dictproj';
const OTHER = 'dictother';

let ctx: TestContext;
let http: ReturnType<typeof client>;
let webhook: WebhookRecorder;
let admin: string;
let owner: string;
let pagesOnly: string;
let otherOwner: string;

const base = `/projects/${PROJECT}/dictionaries/regions`;
const publicUrl = (project = PROJECT) => `/public/${project}/dictionaries/regions`;

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  webhook = await startWebhookRecorder();
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
  await http.post('/projects', admin).send({ slug: OTHER, name: 'Other' }).expect(201);
});

afterAll(async () => {
  await ctx.app.close();
  await webhook.close();
});

describe('справочник регионов', () => {
  let moscow: string;

  it('пустой справочник: список и публичный ответ', async () => {
    expect((await http.get(base, owner).expect(200)).body).toEqual([]);
    expect((await http.get(publicUrl()).expect(200)).body).toEqual([]);
  });

  it('создание: без sortOrder регион встаёт в конец, сайт сразу получает список в этом порядке', async () => {
    const first = await http.post(base, owner).send({ value: 77, label: '  г. Москва ' }).expect(201);
    moscow = first.body.id;
    expect(first.body).toMatchObject({ value: 77, label: 'г. Москва', sortOrder: 10 });
    await http.post(base, owner).send({ value: 1, label: 'Республика Адыгея' }).expect(201);
    await http.post(base, owner).send({ value: 50, label: 'Московская область', sortOrder: 5 }).expect(201);

    const publicList = await http.get(publicUrl()).expect(200);
    expect(publicList.body).toEqual([
      { value: 50, label: 'Московская область' },
      { value: 77, label: 'г. Москва' },
      { value: 1, label: 'Республика Адыгея' },
    ]);
    expect(publicList.headers['cache-control']).toBe('public, no-cache');
    expect(publicList.headers.etag).toBeTruthy();
  });

  it('ETag: повторный запрос с If-None-Match даёт 304', async () => {
    const first = await http.get(publicUrl()).expect(200);
    await http.get(publicUrl()).set('If-None-Match', first.headers.etag as string).expect(304);
  });

  it('идентификатор региона уникален в проекте (409), в другом проекте тот же допустим', async () => {
    await http.post(base, owner).send({ value: 77, label: 'Дубль' }).expect(409);
    await http
      .post(`/projects/${OTHER}/dictionaries/regions`, otherOwner)
      .send({ value: 77, label: 'г. Москва' })
      .expect(201);
    // справочники проектов не смешиваются
    expect((await http.get(publicUrl(OTHER)).expect(200)).body).toEqual([{ value: 77, label: 'г. Москва' }]);
    expect((await http.get(publicUrl()).expect(200)).body).toHaveLength(3);
  });

  it('правка: название и порядок; смена value на занятый даёт 409', async () => {
    const updated = await http.patch(`${base}/${moscow}`, owner).send({ label: 'Москва', sortOrder: 1 }).expect(200);
    expect(updated.body).toMatchObject({ id: moscow, value: 77, label: 'Москва', sortOrder: 1 });
    await http.patch(`${base}/${moscow}`, owner).send({ value: 1 }).expect(409);
    // то же значение самому себе конфликтом не считается
    await http.patch(`${base}/${moscow}`, owner).send({ value: 77 }).expect(200);
    expect((await http.get(publicUrl()).expect(200)).body[0]).toEqual({ value: 77, label: 'Москва' });
  });

  it('валидация: пустое название, нецелое и отрицательное значение, слишком большое число', async () => {
    await http.post(base, owner).send({ value: 3, label: '   ' }).expect(400);
    await http.post(base, owner).send({ value: 1.5, label: 'X' }).expect(400);
    await http.post(base, owner).send({ value: -1, label: 'X' }).expect(400);
    await http.post(base, owner).send({ value: 2_147_483_648, label: 'X' }).expect(400);
    await http.post(base, owner).send({ label: 'X' }).expect(400);
  });

  it('права: без входа 401, только страницы и чужой проект 403, чужой регион 404', async () => {
    await http.get(base).expect(401);
    await http.get(base, pagesOnly).expect(403);
    await http.post(base, pagesOnly).send({ value: 9, label: 'X' }).expect(403);
    await http.get(base, otherOwner).expect(403);
    await http.patch(`${base}/${moscow}`, otherOwner).send({ label: 'Взлом' }).expect(403);

    // регион другого проекта по id из своего проекта не достать
    const foreign = (await http.get(`/projects/${OTHER}/dictionaries/regions`, otherOwner).expect(200)).body[0].id;
    await http.patch(`${base}/${foreign}`, owner).send({ label: 'Взлом' }).expect(404);
    await http.delete(`${base}/${foreign}`, owner).expect(404);
  });

  it('публичный ответ: неизвестный проект даёт 404', async () => {
    await http.get(publicUrl('nope')).expect(404);
  });

  it('изменения вызывают вебхук сайта', async () => {
    const before = webhook.calls.length;
    await http.post(base, owner).send({ value: 200, label: 'Для вебхука' }).expect(201);
    await vi.waitFor(() => expect(webhook.calls.length).toBeGreaterThan(before));
    expect(webhook.calls.at(-1)).toMatchObject({ method: 'POST', secret: 's3cret' });
  });

  it('удаление окончательное: регион пропадает из списка и с сайта', async () => {
    await http.delete(`${base}/${moscow}`, owner).expect(204);
    await http.delete(`${base}/${moscow}`, owner).expect(404);
    const values = (await http.get(publicUrl()).expect(200)).body.map((region: { value: number }) => region.value);
    expect(values).not.toContain(77);
  });
});
