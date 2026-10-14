import { createServer } from 'node:http';
import { SignJWT } from 'jose';
import sharp from 'sharp';
import { importPages } from '../src/cli/import-pages.js';
import { ManifestService } from '../src/manifest/manifest.service.js';
import type { BlockManifest } from '@crito/contract';
import { PagesService } from '../src/pages/pages.service.js';
import { client, createTestContext, sha256, startWebhookRecorder } from './helpers.js';
import type { TestContext, WebhookRecorder } from './helpers.js';

const WEBHOOK_SECRET = 'webhook-secret-e2e';

const manifest: BlockManifest = {
  project: 'rucode',
  version: 'e2e',
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
          title: { type: 'string' },
          body: { type: 'string', 'x-field': 'richtext' },
          cta: { type: 'string', 'x-field': 'link' },
        },
        required: ['title'],
      },
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
    { type: 'legacy', title: 'Legacy', category: 'content', schemaVersion: 1, readonly: true, aliases: [] },
  ],
};

const infoBlock = (data: Record<string, unknown> = { title: 'Привет' }, id = 'b1') => ({
  id,
  type: 'info',
  order: 10,
  enabled: true,
  data,
});

let ctx: TestContext;
let http: ReturnType<typeof client>;
let webhook: WebhookRecorder;

let admin: string;
let ciKey: string;

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  webhook = await startWebhookRecorder();
  admin = await ctx.login('admin@e2e.test', { superAdmin: true });
});

afterAll(async () => {
  await ctx.app.close();
  await webhook.close();
});

describe('авторизация: всё закрыто по умолчанию', () => {
  it.each([
    ['GET', '/projects'],
    ['POST', '/projects'],
    ['GET', '/projects/rucode/pages'],
    ['POST', '/projects/rucode/pages'],
    ['GET', '/projects/rucode/media'],
    ['POST', '/projects/rucode/media'],
    ['GET', '/projects/rucode/manifest'],
  ])('%s %s без сессии даёт 401', async (method, path) => {
    const call = { GET: http.get, POST: http.post }[method as 'GET' | 'POST'];
    await call(path).expect(401);
  });

  it('отклоняет подделанный токен и токен, подписанный чужим секретом', async () => {
    await http.get('/projects', 'not-a-token').expect(401);

    const forged = await new SignJWT({ email: 'x@y.z', sa: true, grants: [] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('someone')
      .setIssuer('crito-cms')
      .setAudience('crito-cms-admin')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('attacker-secret'));
    await http.get('/projects', forged).expect(401);
  });

  it('отклоняет токен с другим audience и просроченный токен', async () => {
    const key = new TextEncoder().encode(process.env.SESSION_SECRET);
    const base = () => new SignJWT({ email: 'x@y.z', sa: true, grants: [] }).setProtectedHeader({ alg: 'HS256' }).setSubject('u').setIssuer('crito-cms');

    const wrongAudience = await base().setAudience('another-app').setExpirationTime('1h').sign(key);
    await http.get('/projects', wrongAudience).expect(401);

    const expired = await base().setAudience('crito-cms-admin').setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key);
    await http.get('/projects', expired).expect(401);
  });

  it('публичное чтение страниц и файлов не требует входа', async () => {
    await http.get('/public/rucode/pages/index').expect(404);
    await http.get('/media/rucode/nothing.png').expect(404);
  });

  it('служебный ADMIN_TOKEN открывает админские методы как суперадмина', async () => {
    await http.get('/projects', process.env.ADMIN_TOKEN).expect(200);
  });

  it.each([
    ['пустой префикс', process.env.ADMIN_TOKEN!.slice(0, -1)],
    ['с лишним символом', `${process.env.ADMIN_TOKEN}x`],
    ['другая длина', 'x'],
  ])('токен, не равный ADMIN_TOKEN (%s), даёт 401', async (_name, token) => {
    await http.get('/projects', token).expect(401);
  });
});

describe('проекты и шифрование секрета', () => {
  it('создать проект может только суперадмин', async () => {
    const user = await ctx.login('plain@e2e.test');
    await http.post('/projects', user).send({ slug: 'nope', name: 'Nope' }).expect(403);
  });

  it('создаёт проект и не отдаёт секреты в ответе', async () => {
    const res = await http
      .post('/projects', admin)
      .send({ slug: 'rucode', name: 'RuCode', revalidateUrl: webhook.url, revalidateSecret: WEBHOOK_SECRET })
      .expect(201);

    ciKey = res.body.ciKey;
    expect(ciKey).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.project.slug).toBe('rucode');
    expect(JSON.stringify(res.body)).not.toContain(WEBHOOK_SECRET);
    expect(res.body.project).not.toHaveProperty('revalidateSecret');
    expect(res.body.project).not.toHaveProperty('ciKeyHash');

    for (const path of ['/projects', '/projects/rucode']) {
      const body = JSON.stringify((await http.get(path, admin).expect(200)).body);
      expect(body).not.toContain(WEBHOOK_SECRET);
      expect(body).not.toContain('ciKeyHash');
    }
  });

  it('хранит секрет вебхука зашифрованным, а ключ CI хешем', async () => {
    const row = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: 'rucode' } });
    expect(row.revalidateSecret).toMatch(/^v1:/);
    expect(row.revalidateSecret).not.toContain(WEBHOOK_SECRET);
    expect(row.ciKeyHash).toBe(sha256(ciKey));
    expect(row.ciKeyHash).not.toBe(ciKey);
  });

  it('проверяет slug и уникальность', async () => {
    await http.post('/projects', admin).send({ slug: 'Bad Slug', name: 'x' }).expect(400);
    await http.post('/projects', admin).send({ slug: 'rucode', name: 'dup' }).expect(409);
    await http.post('/projects', admin).send({ slug: 'x', name: 'x', revalidateUrl: 'not a url' }).expect(400);
  });

  it('PATCH меняет и очищает секрет вебхука', async () => {
    const user = await ctx.login('plain@e2e.test');
    await http.patch('/projects/rucode', user).send({ name: 'Hacked' }).expect(403);

    await http.patch('/projects/rucode', admin).send({ revalidateSecret: 'new-secret' }).expect(200);
    const changed = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: 'rucode' } });
    expect(changed.revalidateSecret).toMatch(/^v1:/);

    await http.patch('/projects/rucode', admin).send({ revalidateSecret: WEBHOOK_SECRET }).expect(200);

    await http.patch('/projects/rucode', admin).send({ revalidateSecret: '', revalidateUrl: '' }).expect(200);
    const cleared = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: 'rucode' } });
    expect(cleared.revalidateSecret).toBeNull();
    expect(cleared.revalidateUrl).toBeNull();

    await http.patch('/projects/rucode', admin).send({ revalidateUrl: webhook.url, revalidateSecret: WEBHOOK_SECRET }).expect(200);
    await http.patch('/projects/missing', admin).send({ name: 'x' }).expect(404);
  });
});

describe('манифест блоков', () => {
  it('принимает манифест только с верным ключом CI', async () => {
    await http.put('/projects/rucode/manifest').send(manifest).expect(401);
    await http.put('/projects/rucode/manifest').set('x-ci-key', 'wrong').send(manifest).expect(401);
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send({ ...manifest, project: 'other' }).expect(400);

    const bad = { ...manifest, blocks: [{ ...manifest.blocks[0], schema: { type: 'not-a-type' } }] };
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(bad).expect(400);

    const dup = { ...manifest, blocks: [manifest.blocks[0], manifest.blocks[0]] };
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(dup).expect(400);

    const ok = await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(manifest).expect(200);
    expect(ok.body.blocks).toBe(3);
  });

  it('отдаёт манифест вошедшим пользователям с сохранением порядка полей', async () => {
    await http.get('/projects/rucode/manifest').expect(401);
    const res = await http.get('/projects/rucode/manifest', admin).expect(200);
    const info = res.body.blocks.find((block: { type: string }) => block.type === 'info');
    expect(Object.keys(info.schema.properties)).toEqual(['title', 'body', 'cta']);
  });

  it('смена ключа CI отключает старый ключ', async () => {
    const rotated = await http.post('/projects/rucode/ci-key', admin).expect(201);
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(manifest).expect(401);
    ciKey = rotated.body.ciKey;
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(manifest).expect(200);
  });
});

describe('страницы: жизненный цикл', () => {
  let pageId: string;

  it('отклоняет блоки, не проходящие проверку по манифесту', async () => {
    const unknown = await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: 'x', blocks: [{ ...infoBlock(), type: 'nope' }] })
      .expect(400);
    expect(unknown.body.errors.join()).toContain('неизвестный type');

    const invalid = await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: 'x', blocks: [infoBlock({ body: '<p>без заголовка</p>' })] })
      .expect(400);
    expect(invalid.body.errors.join()).toContain('title');

    await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: 'x', blocks: [infoBlock(), infoBlock()] })
      .expect(400);

    await http.post('/projects/rucode/pages', admin).send({ slug: '/../etc', blocks: [] }).expect(400);
    await http.post('/projects/rucode/pages', admin).send({ blocks: [] }).expect(400);
  });

  it('создаёт страницу, нормализует адрес и отдаёт её сайту в формате ContentPage', async () => {
    const created = await http
      .post('/projects/rucode/pages', admin)
      .send({
        slug: 'index',
        meta: { title: 'Главная' },
        headerConfig: 'home',
        noFooterSpacing: true,
        blocks: [infoBlock({ title: 'Привет', body: '<p>Текст</p>' })],
      })
      .expect(201);
    pageId = created.body.id;
    expect(created.body.slug).toBe('/index');
    expect(created.body.version).toBe(1);

    await http.post('/projects/rucode/pages', admin).send({ slug: '/index', blocks: [] }).expect(409);

    const pub = await http.get('/public/rucode/pages/index').expect(200);
    expect(pub.body).toEqual({
      slug: '/index',
      version: 1,
      blocks: [{ id: 'b1', type: 'info', order: 10, enabled: true, data: { title: 'Привет', body: '<p>Текст</p>' } }],
      meta: { title: 'Главная' },
      headerConfig: 'home',
      noFooterSpacing: true,
    });

    // всё, что не может быть адресом страницы, это 404: сайт отвечает 502 на любые другие коды
    for (const path of ['..%2Fx', 'Index', 'wp-login.php', 'a%20b', '%D1%82%D0%B5%D1%81%D1%82', 'a/.b']) {
      await http.get('/public/rucode/pages/' + path).expect(404);
    }
    await http.get('/public/other/pages/index').expect(404);
  });

  it('сохранение повышает версию, пишет историю и защищает от конфликтов', async () => {
    const v2 = await http
      .put(`/projects/rucode/pages/${pageId}`, admin)
      .send({ version: 1, blocks: [infoBlock({ title: 'Вторая версия' })] })
      .expect(200);
    expect(v2.body.version).toBe(2);

    // Второй редактор открыл страницу до сохранения и пытается сохранить поверх.
    await http
      .put(`/projects/rucode/pages/${pageId}`, admin)
      .send({ version: 1, blocks: [infoBlock({ title: 'Устаревшая правка' })] })
      .expect(409);

    const pub = await http.get('/public/rucode/pages/index').expect(200);
    expect(pub.body.version).toBe(2);
    expect(pub.body.blocks[0].data.title).toBe('Вторая версия');

    const revisions = await http.get(`/projects/rucode/pages/${pageId}/revisions`, admin).expect(200);
    expect(revisions.body.map((r: { version: number }) => r.version)).toEqual([2, 1]);
    expect(revisions.body[0].author.email).toBe('admin@e2e.test');
  });

  it('откат создаёт новую версию, а история не переписывается', async () => {
    const restored = await http.post(`/projects/rucode/pages/${pageId}/revisions/1/restore`, admin).expect(201);
    expect(restored.body.version).toBe(3);
    const pub = await http.get('/public/rucode/pages/index').expect(200);
    expect(pub.body.blocks[0].data.title).toBe('Привет');

    const revisions = await http.get(`/projects/rucode/pages/${pageId}/revisions`, admin).expect(200);
    expect(revisions.body).toHaveLength(3);
    await http.post(`/projects/rucode/pages/${pageId}/revisions/99/restore`, admin).expect(404);
  });

  it('вызывает вебхук сайта с расшифрованным секретом при каждой публикации', async () => {
    webhook.calls.length = 0;
    const page = await http.get(`/projects/rucode/pages/${pageId}`, admin).expect(200);
    await http
      .put(`/projects/rucode/pages/${pageId}`, admin)
      .send({ version: page.body.version, blocks: page.body.blocks })
      .expect(200);

    // вебхук вызывается в фоне, уже после ответа клиенту
    await vi.waitFor(() => expect(webhook.calls).toEqual([{ method: 'POST', secret: WEBHOOK_SECRET }]));
  });

  it('удаление страницы убирает её с сайта и из списка (подробности в разделе про корзину)', async () => {
    const tmp = await http.post('/projects/rucode/pages', admin).send({ slug: '/tmp', blocks: [] }).expect(201);
    await http.get('/public/rucode/pages/tmp').expect(200);
    await http.delete(`/projects/rucode/pages/${tmp.body.id}`, admin).expect(204);
    await http.get('/public/rucode/pages/tmp').expect(404);
    const list = await http.get('/projects/rucode/pages', admin).expect(200);
    expect(list.body.map((p: { slug: string }) => p.slug)).not.toContain('/tmp');
  });
});

describe('очистка данных блоков', () => {
  it('вычищает опасный HTML до записи в БД и отдаёт сайту чистый', async () => {
    const res = await http
      .post('/projects/rucode/pages', admin)
      .send({
        slug: '/xss',
        blocks: [
          infoBlock({
            title: 'Заголовок',
            // noinspection HtmlRequiredAltAttribute,HtmlUnknownTarget,HtmlDeprecatedAttribute: пейлоад XSS, не разметка
            body: '<p onclick="x()">ок</p><script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">ссылка</a>',
          }),
        ],
      })
      .expect(201);

    const expected = '<p>ок</p><a>ссылка</a>';
    expect(res.body.blocks[0].data.body).toBe(expected);

    const row = await ctx.prisma.page.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(JSON.stringify(row.blocks)).not.toMatch(/script|onerror|onclick|javascript:/i);

    const pub = await http.get('/public/rucode/pages/xss').expect(200);
    expect(pub.body.blocks[0].data.body).toBe(expected);

    const revision = await ctx.prisma.pageRevision.findFirstOrThrow({ where: { pageId: res.body.id } });
    expect(JSON.stringify(revision.blocks)).not.toMatch(/script|onerror/i);
  });

  it('отклоняет опасные адреса в полях link и image', async () => {
    const link = await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: '/bad-link', blocks: [infoBlock({ title: 't', cta: 'javascript:alert(1)' })] })
      .expect(400);
    expect(link.body.errors.join()).toContain('data.cta');

    const image = await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: '/bad-img', blocks: [{ id: 'g', type: 'gallery', order: 1, enabled: true, data: { src: ' java\tscript:alert(1)' } }] })
      .expect(400);
    expect(image.body.errors.join()).toContain('data.src');

    await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: '/ok-link', blocks: [infoBlock({ title: 't', cta: '/champ' }, 'ok1')] })
      .expect(201);
  });
});

describe('права: доступ только к отдельным страницам', () => {
  let pageA: string;
  let pageB: string;
  let editor: string;
  let nobody: string;

  beforeAll(async () => {
    const legacy = { id: 'l', type: 'legacy', order: 20, enabled: true, data: { html: '<b>как было</b>' } };
    pageA = (await http.post('/projects/rucode/pages', admin).send({ slug: '/page-a', blocks: [infoBlock(), legacy] })).body.id;
    pageB = (await http.post('/projects/rucode/pages', admin).send({ slug: '/page-b', blocks: [infoBlock()] })).body.id;

    editor = await ctx.login('editor@e2e.test', { grants: [{ project: 'rucode', scope: 'pages', pageIds: [pageA] }] });
    nobody = await ctx.login('nobody@e2e.test');

    await http.post('/projects', admin).send({ slug: 'other', name: 'Other' }).expect(201);
  });

  it('видит только свои проекты и страницы', async () => {
    const projects = await http.get('/projects', editor).expect(200);
    expect(projects.body.map((p: { slug: string }) => p.slug)).toEqual(['rucode']);

    const pages = await http.get('/projects/rucode/pages', editor).expect(200);
    expect(pages.body.map((p: { slug: string }) => p.slug)).toEqual(['/page-a']);
  });

  it('не видит чужие страницы и проекты', async () => {
    await http.get(`/projects/rucode/pages/${pageB}`, editor).expect(403);
    await http.get('/projects/other/pages', editor).expect(403);
    await http.get('/projects/other', editor).expect(403);
  });

  it('редактирует и публикует только назначенную страницу', async () => {
    const page = await http.get(`/projects/rucode/pages/${pageA}`, editor).expect(200);
    const blocks = page.body.blocks.map((b: { type: string; data: object }) =>
      b.type === 'info' ? { ...b, data: { title: 'Правка редактора' } } : b,
    );
    await http.put(`/projects/rucode/pages/${pageA}`, editor).send({ version: page.body.version, blocks }).expect(200);
    await http.put(`/projects/rucode/pages/${pageB}`, editor).send({ version: 1, blocks: [] }).expect(403);
  });

  it('не может создавать и удалять страницы, менять проект и ключи', async () => {
    await http.post('/projects/rucode/pages', editor).send({ slug: '/new', blocks: [] }).expect(403);
    await http.delete(`/projects/rucode/pages/${pageA}`, editor).expect(403);
    await http.patch('/projects/rucode', editor).send({ name: 'x' }).expect(403);
    await http.post('/projects/rucode/ci-key', editor).expect(403);
    await http.post('/projects', editor).send({ slug: 'z', name: 'z' }).expect(403);
  });

  it('не может менять содержимое блоков без схемы', async () => {
    const page = await http.get(`/projects/rucode/pages/${pageA}`, editor).expect(200);
    // noinspection HtmlRequiredAltAttribute,HtmlUnknownTarget,HtmlDeprecatedAttribute: пейлоад XSS, не разметка
    const tampered = page.body.blocks.map((b: { type: string }) =>
      b.type === 'legacy' ? { ...b, data: { html: '<img src=x onerror=alert(1)>' } } : b,
    );
    const res = await http.put(`/projects/rucode/pages/${pageA}`, editor).send({ version: page.body.version, blocks: tampered }).expect(403);
    expect(res.body.message).toContain('нет схемы');

    // а скрыть такой блок можно
    const hidden = page.body.blocks.map((b: { type: string }) => (b.type === 'legacy' ? { ...b, enabled: false } : b));
    await http.put(`/projects/rucode/pages/${pageA}`, editor).send({ version: page.body.version, blocks: hidden }).expect(200);
  });

  it('пользователь без прав ничего не видит', async () => {
    expect((await http.get('/projects', nobody).expect(200)).body).toEqual([]);
    await http.get('/projects/rucode/pages', nobody).expect(403);
    await http.get('/projects/rucode/media', nobody).expect(403);
    await http.get('/projects/rucode/manifest', nobody).expect(403);
  });

  it('право на весь проект даёт создание страниц, но не управление проектами', async () => {
    const owner = await ctx.login('owner@e2e.test', { grants: [{ project: 'rucode', scope: 'project' }] });
    await http.post('/projects/rucode/pages', owner).send({ slug: '/by-owner', blocks: [infoBlock()] }).expect(201);
    await http.post('/projects/rucode/pages', owner).send({ slug: '/x', blocks: [] }).expect(201);
    await http.post('/projects/other/pages', owner).send({ slug: '/x', blocks: [] }).expect(403);
    await http.patch('/projects/rucode', owner).send({ name: 'x' }).expect(403);
  });
});

describe('медиатека', () => {
  const png = (color: string) => sharp({ create: { width: 12, height: 8, channels: 3, background: color } }).png().toBuffer();
  let mediaId: string;
  let mediaUrlPath: string;
  let editor: string;

  beforeAll(async () => {
    editor = await ctx.login('media-editor@e2e.test', { grants: [{ project: 'rucode', scope: 'pages', pageIds: ['whatever'] }] });
  });

  it('загружает изображение, определяет размеры и сохраняет русское имя файла', async () => {
    const res = await http
      .post('/projects/rucode/media', admin)
      .attach('file', await png('#336699'), { filename: 'красный логотип.png', contentType: 'image/png' })
      .expect(201);

    mediaId = res.body.id;
    expect(res.body).toMatchObject({ mime: 'image/png', width: 12, height: 8, originalName: 'красный логотип.png' });
    expect(res.body.url).toMatch(/^http:\/\/api\.test\/media\/rucode\/[0-9a-f]{64}\.png$/);
    expect(res.body).not.toHaveProperty('projectId');
    mediaUrlPath = new URL(res.body.url).pathname;
  });

  it('дедуплицирует одинаковые файлы', async () => {
    const again = await http.post('/projects/rucode/media', admin).attach('file', await png('#336699'), 'copy.png').expect(201);
    expect(again.body.id).toBe(mediaId);
    const list = await http.get('/projects/rucode/media', admin).expect(200);
    expect(list.body.filter((m: { id: string }) => m.id === mediaId)).toHaveLength(1);
  });

  it('отдаёт файл публично с защитными заголовками и долгим кэшем', async () => {
    const res = await http.get(mediaUrlPath).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.body.length).toBeGreaterThan(0);

    await http.get('/media/rucode/..%2F..%2Fpackage.json').expect(404);
    await http.get(`/media/rucode/${'b'.repeat(64)}.png`).expect(404);
  });

  it('очищает SVG и отклоняет опасные и поддельные файлы', async () => {
    const svg = await http
      .post('/projects/rucode/media', admin)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" onload="alert(1)"/></svg>'), 'ok.svg')
      .expect(201);
    const served = await http.get(new URL(svg.body.url).pathname).expect(200);
    expect(served.headers['content-security-policy']).toContain('sandbox');
    // изображения supertest отдаёт буфером, а не текстом
    const markup = (served.body as Buffer).toString('utf8');
    expect(markup).toContain('<rect');
    expect(markup).not.toContain('onload');

    await http
      .post('/projects/rucode/media', admin)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'bad.svg')
      .expect(400);
    await http.post('/projects/rucode/media', admin).attach('file', Buffer.from('MZ just text'), 'fake.png').expect(400);
    await http.post('/projects/rucode/media', admin).attach('file', Buffer.alloc(0), 'empty.png').expect(400);
    await http.post('/projects/rucode/media', admin).send({}).expect(400);
  });

  it('удаление файла запрещено, пока он используется на странице', async () => {
    // Запросы выполняем по очереди: supertest делит один HTTP-сервер между вложенными запросами.
    const list = await http.get('/projects/rucode/media', admin).expect(200);
    const used = list.body.find((m: { id: string }) => m.id === mediaId);

    const page = await http
      .post('/projects/rucode/pages', admin)
      .send({ slug: '/with-image', blocks: [{ id: 'g', type: 'gallery', order: 1, enabled: true, data: { src: used.url } }] })
      .expect(201);

    const res = await http.delete(`/projects/rucode/media/${mediaId}`, admin).expect(409);
    expect(res.body.pages).toEqual(['/with-image']);

    await http.put(`/projects/rucode/pages/${page.body.id}`, admin).send({ version: 1, blocks: [] }).expect(200);
    await http.delete(`/projects/rucode/media/${mediaId}`, admin).expect(204);
    await http.get(mediaUrlPath).expect(404);
  });

  it('редактор отдельных страниц может загружать файлы, но не удалять', async () => {
    const uploaded = await http.post('/projects/rucode/media', editor).attach('file', await png('#aa5500'), 'mine.png').expect(201);
    await http.delete(`/projects/rucode/media/${uploaded.body.id}`, editor).expect(403);
    await http.delete(`/projects/rucode/media/${uploaded.body.id}`, admin).expect(204);
    await http.delete(`/projects/rucode/media/${uploaded.body.id}`, admin).expect(404);
  });
});

describe('импорт страниц (реальные сервисы)', () => {
  it('создаёт, пропускает существующие и обновляет с --overwrite', async () => {
    const pages = ctx.app.get(PagesService);
    const manifestService = ctx.app.get(ManifestService);
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { email: 'admin@e2e.test' } });
    const principal = { userId: user.id, email: user.email, isSuperAdmin: true, grants: [] };

    const deps = {
      principal,
      findPage: (project: string, slug: string) =>
        ctx.prisma.page.findFirst({ where: { slug, project: { slug: project } }, select: { id: true, version: true } }),
      validateBlocks: (project: string, blocks: Parameters<ManifestService['validateBlocks']>[1]) => manifestService.validateBlocks(project, blocks),
      create: (p: typeof principal, project: string, dto: Parameters<PagesService['create']>[2]) => pages.create(p, project, dto),
      update: (p: typeof principal, project: string, id: string, dto: Parameters<PagesService['update']>[3]) => pages.update(p, project, id, dto),
    };
    const data = {
      project: 'rucode',
      pages: [
        { slug: '/imp-1', blocks: [infoBlock({ title: 'Импорт', body: '<p>ок</p><script>x</script>' })] },
        { slug: '/imp-2', blocks: [{ ...infoBlock(), type: 'unknown' }] },
      ],
    };
    const options = { project: 'rucode', dryRun: false, overwrite: false };

    const first = await importPages(deps, data, options);
    expect(first.map((r) => r.status)).toEqual(['created', 'failed']);
    expect(first[1]?.message).toContain('неизвестный type');

    // импорт проходит через ту же очистку, что и сохранение из админки
    const stored = await http.get('/public/rucode/pages/imp-1').expect(200);
    expect(stored.body.blocks[0].data.body).toBe('<p>ок</p>');
    await http.get('/public/rucode/pages/imp-2').expect(404);

    const second = await importPages(deps, data, options);
    expect(second.map((r) => r.status)).toEqual(['skipped', 'failed']);

    const third = await importPages(deps, data, { ...options, overwrite: true });
    expect(third[0]?.status).toBe('updated');
    expect((await http.get('/public/rucode/pages/imp-1').expect(200)).body.version).toBe(2);
  });
});

describe('эксплуатация и защитные механизмы', () => {
  it('/health отвечает без входа и проверяет БД', async () => {
    const res = await http.get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('скрывает X-Powered-By и ставит защитные заголовки', async () => {
    const res = await http.get('/health').expect(200);
    expect(res.headers).not.toHaveProperty('x-powered-by');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('публичные страницы кэшируются только с проверкой ETag', async () => {
    const first = await http.get('/public/rucode/pages/index').expect(200);
    expect(first.headers['cache-control']).toBe('public, no-cache');
    expect(first.headers.etag).toBeDefined();

    await http.get('/public/rucode/pages/index').set('If-None-Match', first.headers.etag as string).expect(304);
  });

  it('принимает манифест и страницы больше 100 КБ, но не больше 5 МБ', async () => {
    const fillers = Array.from({ length: 400 }, (_, i) => ({
      type: `filler${i}`, title: 'f'.repeat(200), category: 'content', schemaVersion: 1, readonly: true, aliases: [],
    }));
    const big = { ...manifest, blocks: [...manifest.blocks, ...fillers] };
    expect(JSON.stringify(big).length).toBeGreaterThan(100 * 1024);

    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(big).expect(200);
    await http.put('/projects/rucode/manifest').set('x-ci-key', ciKey).send(manifest).expect(200);

    const longText = 'x'.repeat(300 * 1024);
    const page = await http.post('/projects/rucode/pages', admin).send({ slug: '/long', blocks: [infoBlock({ title: longText })] }).expect(201);
    expect(page.body.blocks[0].data.title).toHaveLength(longText.length);

    await http.post('/projects/rucode/pages', admin).send({ slug: '/too-long', blocks: [infoBlock({ title: 'x'.repeat(6 * 1024 * 1024) })] }).expect(413);
  });

  it('сохранение не ждёт зависший сайт', async () => {
    const hanging = createServer(() => { /* не отвечает */ });
    await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
    const port = (hanging.address() as { port: number }).port;

    try {
      await http.patch('/projects/rucode', admin).send({ revalidateUrl: `http://127.0.0.1:${port}/revalidate` }).expect(200);
      const page = await http.post('/projects/rucode/pages', admin).send({ slug: '/slow-site', blocks: [] }).expect(201);

      const started = Date.now();
      await http.put(`/projects/rucode/pages/${page.body.id}`, admin).send({ version: 1, blocks: [] }).expect(200);
      expect(Date.now() - started).toBeLessThan(1500);
    } finally {
      await http.patch('/projects/rucode', admin).send({ revalidateUrl: webhook.url });
      hanging.closeAllConnections();
      await new Promise((resolve) => hanging.close(resolve));
    }
  });
});

describe('номер счётчика Яндекс Метрики', () => {
  it('задаёт суперадмин, менеджер страницы видит значение, публичный API его не отдаёт', async () => {
    await http.patch('/projects/rucode', admin).send({ metrikaCounterId: '12345678' }).expect(200);

    const page = await http.post('/projects/rucode/pages', admin).send({ slug: '/metrika', blocks: [] }).expect(201);
    const manager = await ctx.login('metrika-manager@e2e.test', {
      grants: [{ project: 'rucode', scope: 'pages', pageIds: [page.body.id] }],
    });

    const project = await http.get('/projects/rucode', manager).expect(200);
    expect(project.body.metrikaCounterId).toBe('12345678');
    const list = await http.get('/projects', manager).expect(200);
    expect(list.body.find((p: { slug: string }) => p.slug === 'rucode').metrikaCounterId).toBe('12345678');

    const pub = await http.get('/public/rucode/pages/metrika').expect(200);
    expect(JSON.stringify(pub.body)).not.toContain('12345678');
    expect(pub.body).not.toHaveProperty('metrikaCounterId');
  });

  it('менеджер не меняет номер; принимает только цифры; пустая строка очищает', async () => {
    const manager = await ctx.login('metrika-manager@e2e.test');
    await http.patch('/projects/rucode', manager).send({ metrikaCounterId: '1' }).expect(403);

    // Номер попадает в ссылку на Метрику в админке: всё, кроме цифр, отклоняем.
    for (const bad of ['abc', '12 34', '1234567890123', '../1', '12345678"><script>']) {
      await http.patch('/projects/rucode', admin).send({ metrikaCounterId: bad }).expect(400);
    }
    const unchanged = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: 'rucode' } });
    expect(unchanged.metrikaCounterId).toBe('12345678');

    await http.patch('/projects/rucode', admin).send({ metrikaCounterId: '' }).expect(200);
    const cleared = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: 'rucode' } });
    expect(cleared.metrikaCounterId).toBeNull();
  });
});
