import type { BlockManifest, LoginResponse, UserAccount } from '@crito/contract';
import { client, createTestContext, sha256 } from './helpers.js';
import type { TestContext } from './helpers.js';
import { IDLE_TIMEOUT_MS, MAX_AGE_MS } from '../src/auth/local-auth.service.js';

/** Вход по паролю, серверные сессии и страница «Доступы». У файла свой проект и свои пользователи. */
const PROJECT = 'authproj';
const PASSWORD = 'correct-horse-battery';

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
  ],
};

let ctx: TestContext;
let http: ReturnType<typeof client>;
let admin: string;
let pageA: string;
let pageB: string;

const ip = (n: number) => `10.0.0.${n}`;

function login(email: string, password = PASSWORD, clientIp = ip(1)) {
  return http
    .post('/auth/login')
    .set('x-crito-client-ip', clientIp)
    .send({ email, password });
}

async function token(email: string): Promise<string> {
  const response = await login(email);
  expect(response.status).toBe(200);
  return (response.body as LoginResponse).token;
}

async function createUser(email: string, extra: Record<string, unknown> = {}): Promise<UserAccount> {
  const response = await http.post('/users', admin).send({ email, password: PASSWORD, ...extra }).expect(201);
  return response.body as UserAccount;
}

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  admin = await ctx.login('auth-admin@e2e.test', { superAdmin: true });
  const created = await http.post('/projects', admin).send({ slug: PROJECT, name: 'Auth' }).expect(201);
  await http.put(`/projects/${PROJECT}/manifest`).set('x-ci-key', created.body.ciKey).send(manifest).expect(200);
  const block = { id: 'b1', type: 'info', order: 10, enabled: true, data: { title: 'T' } };
  pageA = (await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/a', meta: { title: 'A' }, blocks: [block] }).expect(201)).body.id;
  pageB = (await http.post(`/projects/${PROJECT}/pages`, admin).send({ slug: '/b', meta: { title: 'B' }, blocks: [block] }).expect(201)).body.id;
});

afterAll(async () => {
  await ctx.app.close();
});

describe('вход по паролю', () => {
  it('верный пароль открывает сессию, токен не хранится в БД открытым текстом', async () => {
    const user = await createUser('login-ok@e2e.test', { name: 'Иван' });
    expect(user).not.toHaveProperty('passwordHash');
    expect(user.hasPassword).toBe(true);

    // регистр и пробелы в почте не важны
    const response = await login('  Login-OK@E2E.test ').expect(200);
    const { token: value, expiresAt } = response.body as LoginResponse;
    expect(value.startsWith('crs_')).toBe(true);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + MAX_AGE_MS - 60_000);

    const me = await http.get('/me', value).expect(200);
    expect(me.body).toMatchObject({ id: user.id, email: 'login-ok@e2e.test', name: 'Иван', isSuperAdmin: false });
    // в БД только хэш токена
    expect(await ctx.prisma.session.count({ where: { tokenHash: value } })).toBe(0);
    expect(await ctx.prisma.session.count({ where: { tokenHash: sha256(value) } })).toBe(1);
  });

  it('неверный пароль и неизвестная почта дают одинаковый 401', async () => {
    await createUser('login-bad@e2e.test');
    const wrongPassword = await login('login-bad@e2e.test', 'wrong-password-1').expect(401);
    const unknown = await login('nobody@e2e.test', 'wrong-password-1').expect(401);
    expect(wrongPassword.body.message).toBe(unknown.body.message);
  });

  it('без токена, с чужим токеном и после выхода доступа нет', async () => {
    await createUser('logout@e2e.test');
    const value = await token('logout@e2e.test');
    await http.get('/me').expect(401);
    await http.get('/me', 'crs_not-a-session').expect(401);
    await http.post('/auth/logout', value).expect(204);
    await http.get('/me', value).expect(401);
  });

  it('сессия без активности 8 часов и сессия старше 7 дней обрываются', async () => {
    await createUser('expiry@e2e.test');
    const idle = await token('expiry@e2e.test');
    const old = await token('expiry@e2e.test');
    const fresh = await token('expiry@e2e.test');

    await ctx.prisma.session.update({ where: { tokenHash: sha256(idle) }, data: { lastUsedAt: new Date(Date.now() - IDLE_TIMEOUT_MS - 60_000) } });
    await ctx.prisma.session.update({ where: { tokenHash: sha256(old) }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await http.get('/me', idle).expect(401);
    await http.get('/me', old).expect(401);
    await http.get('/me', fresh).expect(200);
  });

  it('активность продлевает простой, но не чаще раза в минуту пишет lastUsedAt', async () => {
    await createUser('touch@e2e.test');
    const value = await token('touch@e2e.test');
    const tokenHash = sha256(value);
    const before = (await ctx.prisma.session.findUniqueOrThrow({ where: { tokenHash } })).lastUsedAt;
    await http.get('/me', value).expect(200);
    expect((await ctx.prisma.session.findUniqueOrThrow({ where: { tokenHash } })).lastUsedAt).toEqual(before);

    const stale = new Date(Date.now() - 5 * 60_000);
    await ctx.prisma.session.update({ where: { tokenHash }, data: { lastUsedAt: stale } });
    await http.get('/me', value).expect(200);
    expect((await ctx.prisma.session.findUniqueOrThrow({ where: { tokenHash } })).lastUsedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('лимит попыток: по почте и по IP', async () => {
    await createUser('limit-email@e2e.test');
    // 8 неудач с разных IP упираются в лимит почты; верный пароль после этого тоже не пускает
    for (let i = 0; i < 8; i++) await login('limit-email@e2e.test', 'wrong-password-1', ip(100 + i)).expect(401);
    await login('limit-email@e2e.test', PASSWORD, ip(200)).expect(429);

    // 40 неудач с одного IP по разным почтам блокируют и верный вход с него
    await createUser('limit-ip@e2e.test');
    for (let i = 0; i < 40; i++) await login(`ghost${i}@e2e.test`, 'wrong-password-1', ip(250)).expect(401);
    await login('limit-ip@e2e.test', PASSWORD, ip(250)).expect(429);
    await login('limit-ip@e2e.test', PASSWORD, ip(251)).expect(200);
  });

  it('смена пароля: нужен текущий, остальные сессии обрываются, текущая остаётся', async () => {
    await createUser('change@e2e.test');
    const first = await token('change@e2e.test');
    const second = await token('change@e2e.test');
    await http.post('/auth/password', first).send({ currentPassword: 'nope-nope-nope', newPassword: 'brand-new-password' }).expect(401);
    await http.post('/auth/password', first).send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(400);
    await http.post('/auth/password', first).send({ currentPassword: PASSWORD, newPassword: 'brand-new-password' }).expect(204);

    await http.get('/me', first).expect(200);
    await http.get('/me', second).expect(401);
    await login('change@e2e.test', PASSWORD).expect(401);
    await login('change@e2e.test', 'brand-new-password').expect(200);
  });
});

describe('страница «Доступы»', () => {
  it('только суперадмин; обычный пользователь получает 403', async () => {
    const user = await createUser('plain@e2e.test');
    const value = await token('plain@e2e.test');
    await http.get('/users', value).expect(403);
    await http.post('/users', value).send({ email: 'x@e2e.test', password: PASSWORD }).expect(403);
    await http.patch(`/users/${user.id}`, value).send({ isSuperAdmin: true }).expect(403);
    await http.put(`/users/${user.id}/grants`, value).send({ grants: [] }).expect(403);
    await http.post(`/users/${user.id}/reset-password`, value).send({ password: PASSWORD }).expect(403);
    await http.get('/users').expect(401);
  });

  it('почта уникальна без учёта регистра; короткий пароль отклоняется', async () => {
    await createUser('dup@e2e.test');
    await http.post('/users', admin).send({ email: 'DUP@e2e.test', password: PASSWORD }).expect(409);
    await http.post('/users', admin).send({ email: 'short@e2e.test', password: 'short' }).expect(400);
    const list = await http.get('/users', admin).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('scrypt');
  });

  it('блокировка действует сразу и обрывает сессии; разблокировка возвращает вход', async () => {
    const user = await createUser('block@e2e.test');
    const value = await token('block@e2e.test');
    await http.patch(`/users/${user.id}`, admin).send({ active: false }).expect(200);
    await http.get('/me', value).expect(401);
    await login('block@e2e.test').expect(401);
    await http.patch(`/users/${user.id}`, admin).send({ active: true }).expect(200);
    await login('block@e2e.test').expect(200);
  });

  it('смена прав действует на уже открытую сессию сразу', async () => {
    const user = await createUser('grants@e2e.test');
    const value = await token('grants@e2e.test');
    await http.get(`/projects/${PROJECT}/pages`, value).expect(403);

    await http.put(`/users/${user.id}/grants`, admin).send({ grants: [{ project: PROJECT, scope: 'project' }] }).expect(200);
    await http.get(`/projects/${PROJECT}/pages`, value).expect(200);

    await http.put(`/users/${user.id}/grants`, admin).send({ grants: [] }).expect(200);
    await http.get(`/projects/${PROJECT}/pages`, value).expect(403);
  });

  it('права только на страницы: видит и правит свою, не создаёт, не видит корзину и настройки', async () => {
    const user = await createUser('pages-only@e2e.test');
    const value = await token('pages-only@e2e.test');
    const response = await http
      .put(`/users/${user.id}/grants`, admin)
      .send({ grants: [{ project: PROJECT, scope: 'pages', pageIds: [pageA] }] })
      .expect(200);
    expect((response.body as UserAccount).grants).toEqual([{ project: PROJECT, scope: 'pages', pageIds: [pageA] }]);

    const list = await http.get(`/projects/${PROJECT}/pages`, value).expect(200);
    expect(list.body.map((page: { id: string }) => page.id)).toEqual([pageA]);
    await http.get(`/projects/${PROJECT}/pages/${pageA}`, value).expect(200);
    await http.get(`/projects/${PROJECT}/pages/${pageB}`, value).expect(403);
    await http
      .post(`/projects/${PROJECT}/pages`, value)
      .send({ slug: '/new', meta: { title: 'N' }, blocks: [] })
      .expect(403);
    await http.get(`/projects/${PROJECT}/pages/trash`, value).expect(403);
    await http.patch(`/projects/${PROJECT}`, value).send({ name: 'Хак' }).expect(403);
    await http.get('/users', value).expect(403);
  });

  it('проверка прав: пустые страницы, дубли, чужие страницы и несуществующий проект', async () => {
    const user = await createUser('badgrants@e2e.test');
    const put = (grants: unknown) => http.put(`/users/${user.id}/grants`, admin).send({ grants });
    await put([{ project: PROJECT, scope: 'pages', pageIds: [] }]).expect(400);
    await put([{ project: PROJECT, scope: 'project' }, { project: PROJECT, scope: 'project' }]).expect(400);
    await put([{ project: PROJECT, scope: 'pages', pageIds: ['no-such-page'] }]).expect(400);
    await put([{ project: 'no-such-project', scope: 'project' }]).expect(400);
    await put([{ project: PROJECT, scope: 'admin' }]).expect(400);
    await put('nope').expect(400);
    // после отказов права не изменились
    const list = await http.get('/users', admin).expect(200);
    expect((list.body as UserAccount[]).find((item) => item.id === user.id)?.grants).toEqual([]);
  });

  it('сброс пароля обрывает сессии пользователя', async () => {
    const user = await createUser('reset@e2e.test');
    const value = await token('reset@e2e.test');
    await http.post(`/users/${user.id}/reset-password`, admin).send({ password: 'another-password-1' }).expect(204);
    await http.get('/me', value).expect(401);
    await login('reset@e2e.test', PASSWORD).expect(401);
    await login('reset@e2e.test', 'another-password-1').expect(200);
  });

  it('нельзя заблокировать себя и лишить прав последнего суперадмина', async () => {
    // Другие тесты ничего не оставляют суперадминами с входом, поэтому считаем с нуля.
    await ctx.prisma.user.updateMany({ where: { loginEmail: { not: null }, isSuperAdmin: true }, data: { isSuperAdmin: false } });
    const root = await createUser('root@e2e.test', { isSuperAdmin: true });
    const rootToken = await token('root@e2e.test');

    await http.patch(`/users/${root.id}`, rootToken).send({ active: false }).expect(400);
    await http.patch(`/users/${root.id}`, rootToken).send({ isSuperAdmin: false }).expect(400);
    await http.get('/users', rootToken).expect(200);

    // с двумя суперадминами второго можно понизить, а оставшегося уже нет
    const second = await createUser('root2@e2e.test', { isSuperAdmin: true });
    await http.patch(`/users/${second.id}`, rootToken).send({ isSuperAdmin: false }).expect(200);
    await http.patch(`/users/${root.id}`, rootToken).send({ isSuperAdmin: false }).expect(400);
  });
});

describe('служебные входы не сломаны', () => {
  it('ADMIN_TOKEN и JWT работают вместе с серверными сессиями', async () => {
    await http.get('/me', process.env.ADMIN_TOKEN).expect(200);
    await http.get('/me', admin).expect(200);
  });
});
