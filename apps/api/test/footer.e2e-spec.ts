import sharp from 'sharp';
import type { BlockManifest, JsonSchema } from '@crito/contract';
import { client, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

/** Футер страницы. У файла свой проект, чтобы не зависеть от других сценариев. */
const PROJECT = 'ftrproj';

const link = { type: 'string', 'x-field': 'link' } as const;

const footerSchema: JsonSchema = {
  type: 'object',
  properties: {
    links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { href: link, title: { type: 'string' } },
        required: ['href', 'title'],
        additionalProperties: false,
      },
    },
    regulation: {
      type: 'object',
      properties: { href: link, title: { type: 'string' } },
      required: ['href', 'title'],
      additionalProperties: false,
    },
    contacts: {
      type: 'object',
      properties: { email: { type: 'string' }, logo: { type: 'string', 'x-field': 'image' } },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const bare: BlockManifest = { project: PROJECT, version: 'e2e', blocks: [] };
const full: BlockManifest = { ...bare, footerSchema };

let ctx: TestContext;
let http: ReturnType<typeof client>;
let admin: string;
let ciKey: string;

const putManifest = (manifest: BlockManifest) =>
  http.put(`/projects/${PROJECT}/manifest`).set('x-ci-key', ciKey).send(manifest);

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  admin = await ctx.login('ftr-admin@e2e.test', { superAdmin: true });

  const created = await http.post('/projects', admin).send({ slug: PROJECT, name: 'Footer' }).expect(201);
  ciKey = created.body.ciKey;
});

afterAll(async () => {
  await ctx.app.close();
});

describe('манифест: схема футера', () => {
  it('отклоняет невалидные схемы', async () => {
    await putManifest({ ...bare, footerSchema: { type: 'not-a-type' } }).expect(400);
    await putManifest({ ...bare, footerSchema: [] as unknown as JsonSchema }).expect(400);
  });
});

describe('без схемы в манифесте футер сохранить нельзя', () => {
  beforeAll(async () => {
    await putManifest(bare).expect(200);
  });

  it('страница без футера создаётся, с футером нет: сервер не сможет проверить адреса', async () => {
    await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/plain', blocks: [] }).expect(201);
    const res = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/with-footer', blocks: [], footer: { links: [] } })
      .expect(409);
    expect(res.body.message).toContain('footerSchema');
  });
});

describe('футер страницы', () => {
  let pageId: string;

  const footer = {
    links: [{ href: '#about', title: 'О нас' }],
    regulation: { href: '/files/reglament.pdf', title: 'Регламент' },
    contacts: { email: 'info@rucode.net' },
  };

  beforeAll(async () => {
    await putManifest(full).expect(200);
  });

  it('проверяет форму и адреса по footerSchema', async () => {
    const extra = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], footer: { ...footer, unknown: 1 } })
      .expect(400);
    expect(extra.body.errors.join()).toContain('footer');

    await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], footer: { links: [{ title: 'без адреса' }] } })
      .expect(400);

    const evil = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/bad', blocks: [], footer: { regulation: { href: 'javascript:alert(1)', title: 'x' } } })
      .expect(400);
    expect(evil.body.errors.join()).toContain('footer.regulation.href');

    await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/bad', blocks: [], footer: 'строка' }).expect(400);
  });

  it('создание отдаёт футер сайту', async () => {
    const created = await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/champ', blocks: [], footer }).expect(201);
    pageId = created.body.id;
    expect(created.body.footer).toEqual(footer);

    const pub = await http.get(`/public/${PROJECT}/pages/champ`).expect(200);
    expect(pub.body.footer).toEqual(footer);

    // страница без футера не получает пустого поля: сайт рисует футер по умолчанию
    const plain = await http.get(`/public/${PROJECT}/pages/plain`).expect(200);
    expect(plain.body).not.toHaveProperty('footer');
  });

  it('сохранение пишет футер в черновик, сайт меняется только после публикации', async () => {
    const next = { ...footer, links: [...footer.links, { href: '/champ', title: 'Чемпионат' }] };
    const saved = await http.put(`/projects/${PROJECT}/pages/${pageId}`, admin).send({ version: 1, blocks: [], footer: next }).expect(200);
    expect(saved.body.footer).toEqual(footer);
    expect(saved.body.draft.footer).toEqual(next);
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body.footer).toEqual(footer);

    const published = await http.post(`/projects/${PROJECT}/pages/${pageId}/publish`, admin).send({ version: 1 }).expect(201);
    expect(published.body.version).toBe(2);
    expect(published.body.footer).toEqual(next);
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body.footer).toEqual(next);

    // футер попадает в историю версий
    const v1 = await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions/1`, admin).expect(200);
    const v2 = await http.get(`/projects/${PROJECT}/pages/${pageId}/revisions/2`, admin).expect(200);
    expect(v1.body.footer).toEqual(footer);
    expect(v2.body.footer).toEqual(next);
  });

  it('изменение одного только футера даёт черновик, возврат к опубликованному снимает его', async () => {
    const current = (await http.get(`/projects/${PROJECT}/pages/${pageId}`, admin).expect(200)).body;
    const changed = await http
      .put(`/projects/${PROJECT}/pages/${pageId}`, admin)
      .send({ version: 2, blocks: [], footer: { links: [] } })
      .expect(200);
    expect(changed.body.draft).not.toBeNull();

    const same = await http.put(`/projects/${PROJECT}/pages/${pageId}`, admin).send({ version: 2, blocks: [], footer: current.footer }).expect(200);
    expect(same.body.draft).toBeNull();
  });

  it('убранный футер при публикации стирает прежний', async () => {
    await http.put(`/projects/${PROJECT}/pages/${pageId}`, admin).send({ version: 2, blocks: [] }).expect(200);
    const published = await http.post(`/projects/${PROJECT}/pages/${pageId}/publish`, admin).send({ version: 2 }).expect(201);
    expect(published.body.footer).toBeNull();
    expect((await http.get(`/public/${PROJECT}/pages/champ`).expect(200)).body).not.toHaveProperty('footer');
  });

  it('черновик, сохранённый до появления футера, публикуется с пустым футером', async () => {
    const created = await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/legacy-draft', blocks: [], footer }).expect(201);
    const id = created.body.id as string;
    // как в БД до миграции: в JSON черновика нет ключа footer
    await ctx.prisma.page.update({
      where: { id },
      data: { draft: { blocks: [], meta: null, header: null, noFooterSpacing: false }, draftUpdatedAt: new Date() },
    });
    const detail = await http.get(`/projects/${PROJECT}/pages/${id}`, admin).expect(200);
    expect(detail.body.draft.footer).toBeNull();
    const published = await http.post(`/projects/${PROJECT}/pages/${id}/publish`, admin).send({ version: 1 }).expect(201);
    expect(published.body.footer).toBeNull();
  });

  it('редактор отдельной страницы меняет футер этой страницы и не больше', async () => {
    const other = await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/not-mine', blocks: [] }).expect(201);
    const editor = await ctx.login('ftr-editor@e2e.test', {
      grants: [{ project: PROJECT, scope: 'pages', pageIds: [pageId] }],
    });
    await http.put(`/projects/${PROJECT}/pages/${pageId}`, editor).send({ version: 3, blocks: [], footer }).expect(200);
    await http.put(`/projects/${PROJECT}/pages/${other.body.id}`, editor).send({ version: 1, blocks: [], footer }).expect(403);
  });
});

describe('файлы в футере считаются используемыми', () => {
  const upload = async (color: string) => {
    const buffer = await sharp({ create: { width: 6, height: 6, channels: 3, background: color } }).png().toBuffer();
    const res = await http.post(`/projects/${PROJECT}/media`, admin).attach('file', buffer, `${color.slice(1)}.png`).expect(201);
    return res.body as { id: string; url: string };
  };

  beforeAll(async () => {
    await putManifest(full).expect(200);
  });

  it('файл из футера страницы нельзя удалить, пока футер не снят с сайта', async () => {
    const file = await upload('#332211');
    const page = await http
      .post(`/projects/${PROJECT}/pages`, admin)
      .send({ slug: '/logo-page', blocks: [], footer: { contacts: { logo: file.url } } })
      .expect(201);

    const res = await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(409);
    expect(res.body.pages).toEqual(['/logo-page']);

    // черновик без картинки ещё не освобождает файл: на сайте он до публикации
    await http.put(`/projects/${PROJECT}/pages/${page.body.id}`, admin).send({ version: 1, blocks: [] }).expect(200);
    await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(409);
    await http.post(`/projects/${PROJECT}/pages/${page.body.id}/publish`, admin).send({ version: 1 }).expect(201);
    await http.delete(`/projects/${PROJECT}/media/${file.id}`, admin).expect(204);
  });
});
