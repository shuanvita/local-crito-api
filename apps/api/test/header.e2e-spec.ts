import sharp from 'sharp';
import type { BlockManifest, JsonSchema } from '@crito/contract';
import { client, createTestContext, startWebhookRecorder } from './helpers.js';
import type { TestContext, WebhookRecorder } from './helpers.js';

/** Шапка страницы и общие настройки сайта. У файла свои проекты, чтобы не зависеть от других сценариев. */
const PROJECT = 'hdrproj';
const OTHER = 'hdrother';

const link = { type: 'string', 'x-field': 'link' } as const;

const headerSchema: JsonSchema = {
  type: 'object',
  properties: {
    logo: {
      type: 'object',
      properties: { src: { type: 'string', 'x-field': 'image' }, alt: { type: 'string' } },
      required: ['src'],
      additionalProperties: false,
    },
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { href: link, title: { type: 'string' } },
        required: ['href', 'title'],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

const settingsSchema: JsonSchema = {
  type: 'object',
  properties: {
    eventsLabel: { type: 'string' },
    eventsIcon: { type: 'string', 'x-field': 'image' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { href: link, title: { type: 'string' } },
        required: ['href', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
};

const bare: BlockManifest = { project: PROJECT, version: 'e2e', blocks: [] };
const full: BlockManifest = { ...bare, headerSchema, settingsSchema };

let ctx: TestContext;
let http: ReturnType<typeof client>;
let webhook: WebhookRecorder;
let admin: string;
let owner: string;
let pagesOnly: string;
let ciKey: string;

const putManifest = (manifest: BlockManifest) =>
  http.put(`/projects/${PROJECT}/manifest`).set('x-ci-key', ciKey).send(manifest);

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  webhook = await startWebhookRecorder();
  admin = await ctx.login('hdr-admin@e2e.test', { superAdmin: true });
  owner = await ctx.login('hdr-owner@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });
  pagesOnly = await ctx.login('hdr-pages@e2e.test', { grants: [{ project: PROJECT, scope: 'pages', pageIds: ['any'] }] });

  const created = await http
    .post('/projects', admin)
    .send({ slug: PROJECT, name: 'Header', revalidateUrl: webhook.url, revalidateSecret: 's' })
    .expect(201);
  ciKey = created.body.ciKey;
  await http.post('/projects', admin).send({ slug: OTHER, name: 'Other' }).expect(201);
});

afterAll(async () => {
  await ctx.app.close();
  await webhook.close();
});

describe('манифест: схемы шапки и настроек', () => {
  it('отклоняет невалидные схемы', async () => {
    await putManifest({ ...bare, headerSchema: { type: 'not-a-type' } }).expect(400);
    await putManifest({ ...bare, settingsSchema: { type: 'not-a-type' } }).expect(400);
    await putManifest({ ...bare, headerSchema: [] as unknown as JsonSchema }).expect(400);
  });
});

describe('без схем в манифесте шапку и настройки сохранить нельзя', () => {
  beforeAll(async () => {
    await putManifest(bare).expect(200);
  });

  it('страница без шапки создаётся, с шапкой нет: сервер не сможет проверить адреса', async () => {
    await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/plain', blocks: [] }).expect(201);
    const res = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/with-header', blocks: [], header: { links: [] } })
      .expect(409);
    expect(res.body.message).toContain('headerSchema');
  });

  it('настройки сайта: 409', async () => {
    const res = await http.put(`/projects/${PROJECT}/settings`, admin).send({ settings: { events: [] } }).expect(409);
    expect(res.body.message).toContain('settingsSchema');
  });
});

describe('шапка страницы', () => {
  let pageId: string;

  const header = {
    logo: { src: '/media/hdrproj/logo.png', alt: 'RuCode' },
    links: [{ href: '#about', title: 'О нас' }],
  };

  beforeAll(async () => {
    await putManifest(full).expect(200);
  });

  it('проверяет форму и адреса по headerSchema', async () => {
    const extra = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], header: { ...header, unknown: 1 } })
      .expect(400);
    expect(extra.body.errors.join()).toContain('header');

    await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], header: { links: [{ title: 'без адреса' }] } })
      .expect(400);

    const evil = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], header: { links: [{ href: 'javascript:alert(1)', title: 'x' }] } })
      .expect(400);
    expect(evil.body.errors.join()).toContain('header.links[0].href');

    await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/bad', blocks: [], header: 'строка' }).expect(400);
  });

  it('создание отдаёт шапку сайту', async () => {
    const created = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/champ', blocks: [], headerConfig: 'champ', header })
      .expect(201);
    pageId = created.body.id;
    expect(created.body.header).toEqual(header);

    const pub = await http.get(`/public/${PROJECT}/pages/champ`).expect(200);
    expect(pub.body.header).toEqual(header);
    expect(pub.body.headerConfig).toBe('champ');

    // страница без шапки не получает пустого поля: сайт берёт вариант по headerConfig
    const plain = await http.get(`/public/${PROJECT}/pages/plain`).expect(200);
    expect(plain.body).not.toHaveProperty('header');
  });

  it('сохранение пишет шапку в черновик, сайт меняется только после публикации', async () => {
    const next = { ...header, links: [...header.links, { href: '/champ', title: 'Чемпионат' }] };
    webhook.calls.length = 0;
    const saved = await http
      .put(`/projects/${PROJECT}/pages/${pageId}`, admin)
      .send({ version: 1, blocks: [], headerConfig: 'champ', header: next })
      .expect(200);
    expect(saved.body.header).toEqual(header);
    expect(saved.body.draft.header).toEqual(next);
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body.header).toEqual(header);

    const published = await http.post(`/projects/${PROJECT}/pages/${pageId}/publish`, admin).send({ version: 1 }).expect(201);
    expect(published.body.version).toBe(2);
    expect(published.body.header).toEqual(next);
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body.header).toEqual(next);

    // шапка попадает в историю версий
    const v1 = await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions/1`, admin).expect(200);
    const v2 = await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions/2`, admin).expect(200);
    expect(v1.body.header).toEqual(header);
    expect(v2.body.header).toEqual(next);
  });

  it('изменение одной только шапки даёт черновик, возврат к опубликованному снимает его', async () => {
    const current = (await http.get(`/projects/${PROJECT}/pages/${pageId}`, admin).expect(200)).body;
    const changed = await http
      .put(`/projects/${PROJECT}/pages/${pageId}`, admin)
      .send({ version: 2, blocks: [], headerConfig: 'champ', header: { links: [] } })
      .expect(200);
    expect(changed.body.draft).not.toBeNull();

    const same = await http
      .put(`/projects/${PROJECT}/pages/${pageId}`, admin)
      .send({ version: 2, blocks: [], headerConfig: 'champ', header: current.header })
      .expect(200);
    expect(same.body.draft).toBeNull();
  });

  it('убранная шапка при публикации стирает прежнюю', async () => {
    await http.put(`/projects/${PROJECT}/pages/${pageId}`, admin).send({ version: 2, blocks: [], headerConfig: 'champ' }).expect(200);
    const published = await http.post(`/projects/${PROJECT}/pages/${pageId}/publish`, admin).send({ version: 2 }).expect(201);
    expect(published.body.header).toBeNull();
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body).not.toHaveProperty('header');
  });

  it('черновик, сохранённый до появления шапки, публикуется без ошибки', async () => {
    const created = await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/legacy-draft', blocks: [], header }).expect(201);
    const id = created.body.id as string;
    // как в БД до миграции: в JSON черновика нет ключа header
    await ctx.prisma.page.update({
      where: { id },
      data: {
        draft: { blocks: [], meta: null, headerConfig: 'home', noFooterSpacing: false },
        draftUpdatedAt: new Date(),
      },
    });
    const published = await http.post(`/projects/${PROJECT}/pages/${id}/publish`, admin).send({ version: 1 }).expect(201);
    expect(published.body.header).toBeNull();
    expect(published.body.headerConfig).toBe('home');
  });

  it('редактор отдельной страницы меняет шапку этой страницы и не больше', async () => {
    const other = await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/not-mine', blocks: [] }).expect(201);
    const editor = await ctx.login('hdr-editor@e2e.test', {
      grants: [{ project: PROJECT, scope: 'pages', pageIds: [pageId] }],
    });
    await http.put(`/projects/${PROJECT}/pages/${pageId}`, editor).send({ version: 3, blocks: [], header }).expect(200);
    await http.put(`/projects/${PROJECT}/pages/${other.body.id}`, editor).send({ version: 1, blocks: [], header }).expect(403);
  });
});

describe('общие настройки сайта', () => {
  const settings = {
    eventsLabel: 'Мероприятия',
    events: [
      { href: '/champ', title: 'Чемпионат' },
      { href: '/award2026', title: 'Премия' },
    ],
  };

  beforeAll(async () => {
    await putManifest(full).expect(200);
  });

  it('закрыты по умолчанию и доступны только при праве на весь проект', async () => {
    await http.get(`/projects/${PROJECT}/settings`).expect(401);
    await http.put(`/projects/${PROJECT}/settings`).send({ settings }).expect(401);
    await http.get(`/projects/${PROJECT}/settings`, pagesOnly).expect(403);
    await http.put(`/projects/${PROJECT}/settings`, pagesOnly).send({ settings }).expect(403);
    const stranger = await ctx.login('hdr-other@e2e.test', { grants: [{ project: OTHER, scope: 'project' }] });
    await http.get(`/projects/${PROJECT}/settings`, stranger).expect(403);
  });

  it('пока настройки не заданы: админка получает null, сайт 404', async () => {
    expect((await http.get(`/projects/${PROJECT}/settings`, owner).expect(200)).body).toEqual({ settings: null });
    await http.get(`/public/${PROJECT}/settings`).expect(404);
    await http.get('/public/no-such-project/settings').expect(404);
  });

  it('проверяет форму и адреса по settingsSchema', async () => {
    await http.put(`/projects/${PROJECT}/settings`, owner).send({}).expect(400);
    await http.put(`/projects/${PROJECT}/settings`, owner).send({ settings: [] }).expect(400);
    await http.put(`/projects/${PROJECT}/settings`, owner).send({ settings: { eventsLabel: 'без списка' } }).expect(400);
    await http.put(`/projects/${PROJECT}/settings`, owner).send({ settings: { events: [], extra: 1 } }).expect(400);
    const evil = await http
      .put(`/projects/${PROJECT}/settings`, owner)
      .send({ settings: { events: [{ href: 'javascript:alert(1)', title: 'x' }] } })
      .expect(400);
    expect(evil.body.errors.join()).toContain('settings.events[0].href');
    await http.put('/projects/missing/settings', admin).send({ settings }).expect(404);
    // неудачные сохранения ничего не записали
    expect((await http.get(`/projects/${PROJECT}/settings`, owner).expect(200)).body).toEqual({ settings: null });
  });

  it('сохраняет сразу, сохраняет порядок полей, сбрасывает кэш сайта и отдаёт сайту без входа', async () => {
    webhook.calls.length = 0;
    const saved = await http.put(`/projects/${PROJECT}/settings`, owner).send({ settings }).expect(200);
    expect(saved.body).toEqual({ settings });

    const pub = await http.get(`/public/${PROJECT}/settings`).expect(200);
    expect(pub.body).toEqual(settings);
    expect(Object.keys(pub.body)).toEqual(['eventsLabel', 'events']);
    expect(pub.headers['cache-control']).toBe('public, no-cache');
    expect(pub.headers.etag).toBeTruthy();
    await http.get(`/public/${PROJECT}/settings`).set('If-None-Match', pub.headers.etag).expect(304);

    expect((await http.get(`/projects/${PROJECT}/settings`, owner).expect(200)).body).toEqual({ settings });
    await vi.waitFor(() => expect(webhook.calls).toEqual([{ method: 'POST', secret: 's' }]));

    // настройки проекта не видны через другой проект
    await http.get(`/public/${OTHER}/settings`).expect(404);
  });
});

describe('файлы в шапке и настройках считаются используемыми', () => {
  const upload = async (color: string) => {
    const buffer = await sharp({ create: { width: 6, height: 6, channels: 3, background: color } }).png().toBuffer();
    const res = await http.post(`/projects/${PROJECT}/media`, admin).attach('file', buffer, `${color.slice(1)}.png`).expect(201);
    return res.body as { id: string; url: string };
  };

  beforeAll(async () => {
    await putManifest(full).expect(200);
  });

  it('файл из шапки страницы нельзя удалить, пока шапка не снята с сайта', async () => {
    const file = await upload('#112233');
    const page = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/logo-page', blocks: [], header: { logo: { src: file.url } } })
      .expect(201);

    const res = await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(409);
    expect(res.body.pages).toEqual(['/logo-page']);

    // черновик без логотипа ещё не освобождает файл: на сайте он до публикации
    await http.put(`/projects/${PROJECT}/pages/${page.body.id}`, admin).send({ version: 1, blocks: [] }).expect(200);
    await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(409);
    await http.post(`/projects/${PROJECT}/pages/${page.body.id}/publish`, admin).send({ version: 1 }).expect(201);
    await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(204);
  });

  it('файл из настроек сайта нельзя удалить', async () => {
    const file = await upload('#445566');
    await http
      .put(`/projects/${PROJECT}/settings`, admin)
      .send({ settings: { events: [], eventsIcon: file.url } })
      .expect(200);
    const res = await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(409);
    expect(res.body.message).toContain('настройках сайта');

    await http.put(`/projects/${PROJECT}/settings`, admin).send({ settings: { events: [] } }).expect(200);
    await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(204);
  });
});
