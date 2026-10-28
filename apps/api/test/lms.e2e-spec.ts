import type { BlockManifest, CurrentUser, FormSubmissionList, LmsAccess, PageListItem, ProjectSummary } from '@crito/contract';
import { client, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

/** Вход из LMS: заголовки nginx, группы -> проект, роль -> права внутри проекта. Свои проекты у файла. */
const PROJECT = 'lmsproj';
const OTHER = 'lmsother';
const SECRET = process.env.LMS_TRUST_SECRET as string;

// Страницы создаются только при загруженном манифесте блоков; сами блоки в этом сценарии не нужны.
const manifest: BlockManifest = { project: PROJECT, version: 'e2e', blocks: [] };

let ctx: TestContext;
let http: ReturnType<typeof client>;
let admin: string;
let pageA: string;
let pageB: string;

interface LmsUser {
  id: string;
  login: string;
  name?: string;
  role?: string;
  groups?: string;
}

/** Заголовки так, как их отдаёт LMS: значения через rawurlencode, ответ 204. */
const lmsHeaders = (user: LmsUser, secret = SECRET) => ({
  'X-Cms-Secret': secret,
  'X-Cms-User-Id': encodeURIComponent(user.id),
  'X-Cms-User-Login': encodeURIComponent(user.login),
  ...(user.name !== undefined ? { 'X-Cms-User-Name': encodeURIComponent(user.name) } : {}),
  ...(user.role !== undefined ? { 'X-Cms-User-Role': encodeURIComponent(user.role) } : {}),
  ...(user.groups !== undefined ? { 'X-Cms-User-Groups': encodeURIComponent(user.groups) } : {}),
});

const asLms = (user: LmsUser, path: string, secret?: string) => http.get(path).set(lmsHeaders(user, secret));

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  admin = await ctx.login('lms-admin@e2e.test', { superAdmin: true });

  const created = await http.post('/projects', admin).send({ slug: PROJECT, name: 'Lms' }).expect(201);
  await http.put(`/projects/${PROJECT}/manifest`).set('x-ci-key', created.body.ciKey).send(manifest).expect(200);
  await http.post('/projects', admin).send({ slug: OTHER, name: 'LmsOther' }).expect(201);
  for (const [slug, title] of [['/a', 'A'], ['/b', 'B']] as const) {
    await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug, blocks: [], meta: { title } }).expect(201);
  }
  const pages = (await http.get(`/projects/${PROJECT}/pages`, admin).expect(200)).body as PageListItem[];
  pageA = pages.find((page) => page.slug === '/a')!.id;
  pageB = pages.find((page) => page.slug === '/b')!.id;
});

afterAll(async () => {
  await ctx.app.close();
});

describe('настройка доступа из LMS (суперадмин)', () => {
  it('по умолчанию пусто', async () => {
    const res = await http.get(`/projects/${PROJECT}/lms-access`, admin).expect(200);
    expect(res.body).toEqual({ groups: [], roles: [] });
  });

  it('сохраняет группы и профили ролей, роль приводится к нижнему регистру', async () => {
    const body: LmsAccess = {
      groups: [' g-main ', 'g-main', 'g-extra'],
      roles: [
        { role: 'Manager', scope: 'project', pageIds: ['ignored'], requests: true },
        { role: 'editor', scope: 'pages', pageIds: [pageA], requests: false },
        { role: 'requests-only', scope: 'pages', pageIds: [pageB], requests: true },
      ],
    };
    const res = await http.put(`/projects/${PROJECT}/lms-access`, admin).send(body).expect(200);
    expect((res.body as LmsAccess).groups).toEqual(['g-extra', 'g-main']);
    expect((res.body as LmsAccess).roles).toEqual([
      { role: 'editor', scope: 'pages', pageIds: [pageA], requests: false },
      { role: 'manager', scope: 'project', pageIds: [], requests: true },
      { role: 'requests-only', scope: 'pages', pageIds: [pageB], requests: true },
    ]);
  });

  it('проверяет входные данные', async () => {
    const put = (body: unknown) => http.put(`/projects/${PROJECT}/lms-access`, admin).send(body as object);
    await put({ groups: ['a,b'], roles: [] }).expect(400);
    await put({ groups: [''], roles: [] }).expect(400);
    await put({ groups: [], roles: [{ role: 'x', scope: 'pages', pageIds: [], requests: false }] }).expect(400);
    await put({ groups: [], roles: [{ role: 'x', scope: 'pages', pageIds: ['nope'], requests: false }] }).expect(400);
    await put({ groups: [], roles: [{ role: 'x', scope: 'all', pageIds: [], requests: false }] }).expect(400);
    await put({ groups: [], roles: [{ role: 'x', scope: 'project', pageIds: [] }] }).expect(400);
    const dup = { role: 'x', scope: 'project', pageIds: [], requests: false };
    await put({ groups: [], roles: [dup, { ...dup, role: 'X' }] }).expect(400);
    // Ошибка не должна затирать сохранённое ранее.
    const res = await http.get(`/projects/${PROJECT}/lms-access`, admin).expect(200);
    expect((res.body as LmsAccess).roles).toHaveLength(3);
  });

  it('только суперадмин и только существующий проект', async () => {
    const editor = await ctx.login('lms-local@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });
    await http.get(`/projects/${PROJECT}/lms-access`, editor).expect(403);
    await http.put(`/projects/${PROJECT}/lms-access`, editor).send({ groups: [], roles: [] }).expect(403);
    await http.get('/projects/no-such/lms-access', admin).expect(404);
  });
});

describe('заголовки LMS', () => {
  const manager: LmsUser = { id: '101', login: 'Manager@Example.com', name: 'Иван Петров', role: 'manager', groups: 'g-main' };

  it('без секрета или с неверным секретом: 401, заголовки пользователя сами по себе ничего не дают', async () => {
    await asLms(manager, '/me', 'wrong-secret').expect(401);
    await http.get('/me').set({ ...lmsHeaders(manager), 'X-Cms-Secret': '' }).expect(401);
    const { 'X-Cms-Secret': _secret, ...withoutSecret } = lmsHeaders(manager);
    await http.get('/me').set(withoutSecret).expect(401);
    // Верный служебный токен рядом с неверным секретом тоже не спасает: запрос объявил себя запросом от LMS.
    await http
      .get('/me', admin)
      .set('X-Cms-Secret', 'wrong-secret')
      .expect(401);
  });

  it('неполные и испорченные заголовки: 401', async () => {
    await asLms({ id: '', login: 'a@b.ru' }, '/me').expect(401);
    await asLms({ id: '1', login: 'не-почта' }, '/me').expect(401);
    // Битая кодировка в том, что решает права (роль, группы, id, почта), это отказ.
    for (const header of ['X-Cms-User-Role', 'X-Cms-User-Groups', 'X-Cms-User-Id', 'X-Cms-User-Login']) {
      await http
        .get('/me')
        .set({ ...lmsHeaders(manager), [header]: '%E0%A4%A' })
        .expect(401);
    }
  });

  it('битое имя не мешает входу: оно нужно только для отображения', async () => {
    const res = await http
      .get('/me')
      .set({ ...lmsHeaders({ id: '160', login: 'noname@example.com' }), 'X-Cms-User-Name': '%E0%A4%A' })
      .expect(200);
    expect((res.body as CurrentUser).name).toBeNull();
  });

  it('создаёт пользователя из заголовков: имя и почта декодируются, суперадмином он не становится', async () => {
    const res = await asLms(manager, '/me').expect(200);
    const me = res.body as CurrentUser;
    expect(me).toMatchObject({ email: 'manager@example.com', name: 'Иван Петров', isSuperAdmin: false, viaLms: true });
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { externalId: 'lms:101' } });
    expect(user.loginEmail).toBeNull();
    expect(user.passwordHash).toBeNull();
  });

  it('роль manager в группе проекта: весь проект и заявки', async () => {
    const projects = (await asLms(manager, '/projects').expect(200)).body as ProjectSummary[];
    expect(projects.map((project) => project.slug)).toEqual([PROJECT]);
    expect(projects[0]).toMatchObject({ fullAccess: true, requestsAccess: true });
    await asLms(manager, `/projects/${PROJECT}/requests`).expect(200);
    await asLms(manager, `/projects/${OTHER}/pages`).expect(403);
  });

  it('роль editor: только выбранная страница, заявок нет', async () => {
    const editor: LmsUser = { id: '102', login: 'editor@example.com', role: 'editor', groups: 'g-main' };
    const projects = (await asLms(editor, '/projects').expect(200)).body as ProjectSummary[];
    expect(projects[0]).toMatchObject({ fullAccess: false, requestsAccess: false, pagesCount: 1 });
    const pages = (await asLms(editor, `/projects/${PROJECT}/pages`).expect(200)).body as PageListItem[];
    expect(pages.map((page) => page.id)).toEqual([pageA]);
    await asLms(editor, `/projects/${PROJECT}/requests`).expect(403);
  });

  it('заявки отдельным правом: страница B и раздел «Заявки», но не страница A', async () => {
    const user: LmsUser = { id: '103', login: 'req@example.com', role: 'requests-only', groups: 'g-extra,other-group' };
    const projects = (await asLms(user, '/projects').expect(200)).body as ProjectSummary[];
    expect(projects[0]).toMatchObject({ fullAccess: false, requestsAccess: true, pagesCount: 1 });
    const list = (await asLms(user, `/projects/${PROJECT}/requests`).expect(200)).body as FormSubmissionList;
    expect(list.total).toBeGreaterThanOrEqual(0);
    const pages = (await asLms(user, `/projects/${PROJECT}/pages`).expect(200)).body as PageListItem[];
    expect(pages.map((page) => page.id)).toEqual([pageB]);
  });

  it('закрыто по умолчанию: чужая группа, неизвестная роль, нет роли или групп', async () => {
    const empty = async (user: LmsUser) => {
      await asLms(user, '/me').expect(200);
      expect((await asLms(user, '/projects').expect(200)).body).toEqual([]);
      await asLms(user, `/projects/${PROJECT}/pages`).expect(403);
    };
    await empty({ id: '110', login: 'a1@example.com', role: 'manager', groups: 'foreign-group' });
    await empty({ id: '111', login: 'a2@example.com', role: 'unknown-role', groups: 'g-main' });
    await empty({ id: '112', login: 'a3@example.com', groups: 'g-main' });
    await empty({ id: '113', login: 'a4@example.com', role: 'manager' });
  });

  it('роль без учёта регистра, роль и группы пересчитываются на каждом запросе', async () => {
    const user: LmsUser = { id: '120', login: 'move@example.com', role: 'MANAGER', groups: 'g-main' };
    await asLms(user, `/projects/${PROJECT}/pages`).expect(200);
    // Понизили роль: сразу меньше прав.
    await asLms({ ...user, role: 'editor' }, `/projects/${PROJECT}/requests`).expect(403);
    // Убрали из группы: доступа к проекту нет.
    await asLms({ ...user, groups: '' }, `/projects/${PROJECT}/pages`).expect(403);
    // Вернули: права снова есть, запись прав одна на проект.
    await asLms(user, `/projects/${PROJECT}/pages`).expect(200);
    const dbUser = await ctx.prisma.user.findUniqueOrThrow({ where: { externalId: 'lms:120' } });
    expect(await ctx.prisma.userGrant.count({ where: { userId: dbUser.id, source: 'lms' } })).toBe(1);
  });

  it('изменение настроек проекта действует на следующий запрос', async () => {
    const user: LmsUser = { id: '121', login: 'late@example.com', role: 'newrole', groups: 'g-main' };
    await asLms(user, `/projects/${PROJECT}/pages`).expect(403);
    const current = (await http.get(`/projects/${PROJECT}/lms-access`, admin).expect(200)).body as LmsAccess;
    const next = { ...current, roles: [...current.roles, { role: 'newrole', scope: 'project', pageIds: [], requests: false }] };
    await http.put(`/projects/${PROJECT}/lms-access`, admin).send(next).expect(200);
    await asLms(user, `/projects/${PROJECT}/pages`).expect(200);
    await asLms(user, `/projects/${PROJECT}/requests`).expect(403);
  });

  it('заблокированный пользователь LMS не входит', async () => {
    const user: LmsUser = { id: '130', login: 'blocked@example.com', role: 'manager', groups: 'g-main' };
    await asLms(user, '/me').expect(200);
    await ctx.prisma.user.update({ where: { externalId: 'lms:130' }, data: { active: false } });
    await asLms(user, '/me').expect(401);
  });

  it('локальная учётка с той же почтой присоединяется к LMS и остаётся суперадмином', async () => {
    const local = await ctx.prisma.user.create({
      data: { externalId: 'local:e2e-link', email: 'owner@example.com', loginEmail: 'owner@example.com', passwordHash: 'x', isSuperAdmin: true },
    });
    const res = await asLms({ id: '140', login: 'Owner@example.com', name: 'Владелец' }, '/me').expect(200);
    expect(res.body).toMatchObject({ id: local.id, isSuperAdmin: true, viaLms: true });
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: local.id } })).externalId).toBe('lms:140');
  });

  it('суперадмином через заголовки стать нельзя, а роль «admin» ничего особого не даёт', async () => {
    const res = await asLms({ id: '150', login: 'x@example.com', role: 'admin', groups: 'g-main' }, '/me').expect(200);
    expect((res.body as CurrentUser).isSuperAdmin).toBe(false);
    await asLms({ id: '150', login: 'x@example.com', role: 'admin', groups: 'g-main' }, '/users').expect(403);
  });

  it('LMS-пользователь не видит настроек доступа', async () => {
    const user: LmsUser = { id: '101', login: 'manager@example.com', role: 'manager', groups: 'g-main' };
    await asLms(user, `/projects/${PROJECT}/lms-access`).expect(403);
  });
});
