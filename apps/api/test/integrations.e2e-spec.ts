import type {
  IntegrationSummary,
  TelegramDiscoverResponse,
  TelegramIntegration,
  TelegramTestResponse,
} from '@crito/contract';
import { TelegramNotifierService } from '../src/integrations/telegram-notifier.service.js';
import { client, createTestContext, startTelegramStub } from './helpers.js';
import type { TelegramStub, TestContext } from './helpers.js';

/** Интеграции проекта и Telegram-уведомления о заявках. Telegram заменён локальной заглушкой. */
const PROJECT = 'intproj';
const OTHER = 'intother';
const TOKEN = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER_TOKEN = '654321:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

let ctx: TestContext;
let http: ReturnType<typeof client>;
let telegram: TelegramStub;
let admin: string;
let owner: string;
let pagesOnly: string;

const url = (project = PROJECT, path = '') => `/projects/${project}/integrations${path}`;
const tg = (path = '') => url(PROJECT, `/telegram${path}`);

const submit = (fields: Record<string, string | string[]>, extra: Record<string, unknown> = {}, project = PROJECT) =>
  http.post(`/public/${project}/requests`).send({ form: 'participation', fields, ...extra });

/** Уведомления уходят в фоне: дожидаемся их, прежде чем смотреть на заглушку. */
const settled = () => ctx.app.get(TelegramNotifierService).flush();

beforeAll(async () => {
  telegram = await startTelegramStub();
  telegram.validTokens.add(TOKEN).add(OTHER_TOKEN);
  process.env.TELEGRAM_API_BASE = telegram.url;

  ctx = await createTestContext();
  http = client(ctx.app);
  admin = await ctx.login('int-admin@e2e.test', { superAdmin: true });
  owner = await ctx.login('int-owner@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });
  pagesOnly = await ctx.login('int-pages@e2e.test', { grants: [{ project: PROJECT, scope: 'pages', pageIds: ['any'] }] });

  await http.post('/projects', admin).send({ slug: PROJECT, name: 'Integrations' }).expect(201);
  await http.post('/projects', admin).send({ slug: OTHER, name: 'Other' }).expect(201);
});

afterAll(async () => {
  await ctx.app.close();
  await telegram.close();
  delete process.env.TELEGRAM_API_BASE;
});

describe('права', () => {
  it('только суперадминистратор: остальным 403, без сессии 401', async () => {
    const calls = [
      () => http.get(url(), owner),
      () => http.get(tg(), owner),
      () => http.put(tg(), owner).send({ enabled: false }),
      () => http.post(tg('/test'), owner),
      () => http.post(tg('/discover-chats'), owner),
      () => http.delete(tg(), owner),
    ];
    for (const call of calls) await call().expect(403);
    await http.get(tg(), pagesOnly).expect(403);
    await http.get(url()).expect(401);
    await http.put(tg()).send({ enabled: false }).expect(401);
  });

  it('несуществующий проект: 404', async () => {
    await http.get(url('no-such-project'), admin).expect(404);
    await http.get(url('no-such-project', '/telegram'), admin).expect(404);
  });
});

describe('настройка Telegram', () => {
  it('каталог: Telegram не настроен', async () => {
    const list = (await http.get(url(), admin).expect(200)).body as IntegrationSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'telegram', title: 'Telegram', configured: false, enabled: false });
  });

  it('пустые настройки по умолчанию', async () => {
    const body = (await http.get(tg(), admin).expect(200)).body as TelegramIntegration;
    expect(body).toMatchObject({ enabled: false, hasToken: false, botUsername: null, chats: [], forms: [] });
  });

  it('невалидные данные: 400', async () => {
    await http.put(tg(), admin).send({ botToken: 'не токен' }).expect(400);
    await http.put(tg(), admin).send({ chats: [{ id: 'abc', title: null }] }).expect(400);
    await http.put(tg(), admin).send({ chats: [{ id: '@ab', title: null }] }).expect(400);
    await http.put(tg(), admin).send({ forms: ['bad form!'] }).expect(400);
    await http.put(tg(), admin).send({ enabled: 'yes' }).expect(400);
    await http
      .put(tg(), admin)
      .send({ chats: Array.from({ length: 21 }, (_, i) => ({ id: String(i + 1), title: null })) })
      .expect(400);
    await http.put(tg(), admin).send({ formLabels: { 'bad key!': 'x' } }).expect(400);
    await http.put(tg(), admin).send({ formLabels: { ok: 5 } }).expect(400);
    await http.put(tg(), admin).send({ formLabels: { ok: 'x'.repeat(101) } }).expect(400);
  });

  it('включить без токена или без чатов нельзя', async () => {
    await http.put(tg(), admin).send({ enabled: true }).expect(400);
    await http.put(tg(), admin).send({ enabled: true, chats: [{ id: '-100', title: null }] }).expect(400);
  });

  it('токен, который Telegram не принял: 400, и ничего не сохраняется', async () => {
    const res = await http.put(tg(), admin).send({ botToken: '111111:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' }).expect(400);
    expect(JSON.stringify(res.body)).not.toContain('CCCCCCCC');
    expect(((await http.get(tg(), admin).expect(200)).body as TelegramIntegration).hasToken).toBe(false);
  });

  it('недоступный Telegram при проверке токена: 502', async () => {
    telegram.down = true;
    try {
      await http.put(tg(), admin).send({ botToken: TOKEN }).expect(502);
    } finally {
      telegram.down = false;
    }
    expect(((await http.get(tg(), admin).expect(200)).body as TelegramIntegration).hasToken).toBe(false);
  });

  it('сохранение: токен проверяется, секрет не возвращается и лежит в БД зашифрованным', async () => {
    const res = await http
      .put(tg(), admin)
      .send({
        botToken: TOKEN,
        chats: [
          { id: '-1001', title: ' Менеджеры ' },
          { id: '-1001', title: 'дубль' },
          { id: '@rucode_news', title: null },
        ],
        formLabels: { participation: 'Участие', empty: '  ' },
      })
      .expect(200);
    const body = res.body as TelegramIntegration;
    expect(body).toMatchObject({
      enabled: false,
      hasToken: true,
      botUsername: 'rucode_bot',
      chats: [
        { id: '-1001', title: 'Менеджеры' },
        { id: '@rucode_news', title: null },
      ],
      formLabels: { participation: 'Участие' },
    });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(JSON.stringify((await http.get(tg(), admin).expect(200)).body)).not.toContain(TOKEN);
    expect(JSON.stringify((await http.get(url(), admin).expect(200)).body)).not.toContain(TOKEN);

    const project = await ctx.prisma.project.findUniqueOrThrow({ where: { slug: PROJECT } });
    const row = await ctx.prisma.projectIntegration.findUniqueOrThrow({
      where: { projectId_type: { projectId: project.id, type: 'telegram' } },
    });
    expect(row.secret).toMatch(/^v1:/);
    expect(row.secret).not.toContain(TOKEN);
    expect(JSON.stringify(row.config)).not.toContain(TOKEN);
  });

  it('частичное сохранение не трогает остальное; токен остаётся', async () => {
    const body = (await http.put(tg(), admin).send({ forms: ['participation', 'participation'] }).expect(200))
      .body as TelegramIntegration;
    expect(body).toMatchObject({ hasToken: true, forms: ['participation'], chats: expect.any(Array) });
    expect(body.chats).toHaveLength(2);
  });

  it('ключ __proto__ в названиях форм не меняет прототип; остальные названия сохраняются', async () => {
    // Ключи `__proto__` и `constructor` отбрасывает ValidationPipe (class-transformer) ещё до сервиса:
    // названия для форм с такими ключами не сохраняются, зато и прототип не затрагивается.
    const res = await http
      .put(tg(), admin)
      .send(JSON.parse('{"formLabels":{"participation":"Участие","constructor":"Конструктор","__proto__":{"polluted":"yes"}}}'))
      .expect(200);
    const labels = (res.body as TelegramIntegration).formLabels;
    expect(labels).toEqual({ participation: 'Участие' });
    expect(Object.getPrototypeOf(labels)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    await http.put(tg(), admin).send({ formLabels: { participation: 'Участие' } }).expect(200);
  });

  it('тестовая отправка и поиск чатов', async () => {
    telegram.calls.length = 0;
    const test = (await http.post(tg('/test'), admin).expect(200)).body as TelegramTestResponse;
    expect(test.results).toEqual([
      { chatId: '-1001', ok: true, error: null },
      { chatId: '@rucode_news', ok: true, error: null },
    ]);
    expect(telegram.sent().map((message) => message.chatId).sort()).toEqual(['-1001', '@rucode_news']);
    expect(telegram.sent()[0].text).toContain('Integrations');

    telegram.updates = [
      { update_id: 1, message: { chat: { id: -1002, type: 'supergroup', title: 'Отдел продаж' } } },
      { update_id: 2, my_chat_member: { chat: { id: -1002, type: 'supergroup', title: 'Отдел продаж' } } },
      { update_id: 3, message: { chat: { id: 77, type: 'private', first_name: 'Анна', last_name: 'К' } } },
    ];
    const found = (await http.post(tg('/discover-chats'), admin).expect(200)).body as TelegramDiscoverResponse;
    expect(found.chats).toEqual([
      { id: '-1002', title: 'Отдел продаж', type: 'supergroup' },
      { id: '77', title: 'Анна К', type: 'private' },
    ]);
  });

  it('тестовая отправка показывает ошибку чата и записывает её в карточку', async () => {
    telegram.failChats.add('@rucode_news');
    try {
      const test = (await http.post(tg('/test'), admin).expect(200)).body as TelegramTestResponse;
      expect(test.results[0]).toMatchObject({ chatId: '-1001', ok: true });
      expect(test.results[1]).toMatchObject({ chatId: '@rucode_news', ok: false });
      expect(test.results[1].error).toContain('bot was kicked');
    } finally {
      telegram.failChats.clear();
    }
    const state = (await http.get(tg(), admin).expect(200)).body as TelegramIntegration;
    // Частичный отказ: один чат получил сообщение, другой нет. Ошибка остаётся, пока не пройдёт полная отправка.
    expect(state.lastSuccessAt).not.toBeNull();
    expect(state.lastError).toContain('@rucode_news');
    expect(state.lastError).not.toContain(TOKEN);
    expect(state.lastErrorAt).not.toBeNull();

    // Успешная отправка сбрасывает ошибку.
    await http.post(tg('/test'), admin).expect(200);
    const healed = (await http.get(tg(), admin).expect(200)).body as TelegramIntegration;
    expect(healed.lastError).toBeNull();
    expect(healed.lastSuccessAt).not.toBeNull();
  });

  it('смена токена сбрасывает старую ошибку и обновляет бота', async () => {
    telegram.failChats.add('-1001');
    await http.post(tg('/test'), admin).expect(200);
    telegram.failChats.clear();
    const res = await http.put(tg(), admin).send({ botToken: OTHER_TOKEN }).expect(200);
    expect((res.body as TelegramIntegration).lastError).toBeNull();
    await http.put(tg(), admin).send({ botToken: TOKEN }).expect(200);
  });
});

describe('уведомления о заявках', () => {
  beforeAll(async () => {
    await http.put(tg(), admin).send({ enabled: true, forms: [] }).expect(200);
  });

  beforeEach(() => {
    telegram.calls.length = 0;
  });

  it('заявка уходит во все чаты; ответ сайту не ждёт Telegram', async () => {
    const res = await submit(
      { name: 'Иван <b>Петров</b>', email: 'ivan@example.com', events: ['a', 'b'] },
      { pageUrl: 'https://rucode.example/start' },
    ).expect(201);
    expect(res.body).toEqual({ accepted: true });
    await settled();

    const sent = telegram.sent();
    expect(sent.map((message) => message.chatId).sort()).toEqual(['-1001', '@rucode_news']);
    expect(sent.every((message) => message.token === TOKEN)).toBe(true);
    const text = sent[0].text;
    expect(text).toContain('<b>Поступила новая заявка с сайта</b>');
    expect(text).not.toContain('Иван');
    expect(text).toContain('Страница: https://rucode.example/start');
    expect(text).toMatch(/<a href="http:\/\/api\.test\/intproj\/requests\?id=\w+">Открыть заявку в админке<\/a>/);
    expect(sent[0]).toBeDefined();
    expect(telegram.calls.find((call) => call.method === 'sendMessage')?.body.parse_mode).toBe('HTML');
  });

  it('ссылка в сообщении ведёт на сохранённую заявку', async () => {
    await submit({ name: 'Связь' }).expect(201);
    await settled();
    const id = /requests\?id=(\w+)/.exec(telegram.sent()[0].text)?.[1];
    expect(id).toBeTruthy();
    const detail = await http.get(`/projects/${PROJECT}/requests/${id}`, owner).expect(200);
    expect(detail.body.fields).toEqual({ name: 'Связь' });
  });

  it('сбой Telegram не ломает приём: заявка сохранена, ошибка видна в карточке', async () => {
    telegram.failChats.add('-1001').add('@rucode_news');
    try {
      await submit({ name: 'Сохранена несмотря на сбой' }).expect(201);
      await settled();
    } finally {
      telegram.failChats.clear();
    }
    const list = await http.get(`/projects/${PROJECT}/requests?q=${encodeURIComponent('несмотря')}`, owner).expect(200);
    expect(list.body.total).toBe(1);
    const state = (await http.get(tg(), admin).expect(200)).body as TelegramIntegration;
    expect(state.lastError).toContain('bot was kicked');
    const summary = ((await http.get(url(), admin).expect(200)).body as IntegrationSummary[])[0];
    expect(summary.lastError).toContain('bot was kicked');
  });

  it('ловушка для ботов и неизвестный проект не создают уведомлений', async () => {
    await submit({ name: 'Бот' }, { website: 'http://spam.example' }).expect(201);
    await submit({ name: 'Нет такого' }, {}, 'no-such-project').expect(404);
    await settled();
    expect(telegram.sent()).toEqual([]);
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'форма с ключом «%s» (его выбирает посетитель сайта) тоже уведомляет',
    async (form) => {
      await http.post(`/public/${PROJECT}/requests`).send({ form, fields: { name: 'Необычный ключ' } }).expect(201);
      await settled();
      expect(telegram.sent()).toHaveLength(2);
      expect(telegram.sent()[0].text).toContain('Поступила новая заявка с сайта');
    },
  );

  it('невалидная заявка (400) не создаёт уведомления', async () => {
    await http.post(`/public/${PROJECT}/requests`).send({ form: 'participation', fields: {} }).expect(400);
    await settled();
    expect(telegram.sent()).toEqual([]);
  });

  it('фильтр по формам: прочие формы молчат', async () => {
    await http.put(tg(), admin).send({ forms: ['consortium'] }).expect(200);
    await submit({ name: 'Не та форма' }).expect(201);
    await settled();
    expect(telegram.sent()).toEqual([]);

    await http.post(`/public/${PROJECT}/requests`).send({ form: 'consortium', fields: { name: 'Та форма' } }).expect(201);
    await settled();
    expect(telegram.sent()).toHaveLength(2);
    expect(telegram.sent()[0].text).toContain('Поступила новая заявка с сайта');
    await http.put(tg(), admin).send({ forms: [] }).expect(200);
  });

  it('выключенная интеграция молчит, чужой проект не уведомляется', async () => {
    await http.put(tg(), admin).send({ enabled: false }).expect(200);
    await submit({ name: 'Выключено' }).expect(201);
    await settled();
    expect(telegram.sent()).toEqual([]);

    await http.put(tg(), admin).send({ enabled: true }).expect(200);
    await submit({ name: 'Чужой проект' }, {}, OTHER).expect(201);
    await settled();
    expect(telegram.sent()).toEqual([]);
  });

  it('удаление токена выключает интеграцию', async () => {
    const res = await http.put(tg(), admin).send({ botToken: '' }).expect(200);
    expect(res.body).toMatchObject({ enabled: false, hasToken: false, botUsername: null });
    await submit({ name: 'Без токена' }).expect(201);
    await settled();
    expect(telegram.sent()).toEqual([]);
    await http.post(tg('/test'), admin).expect(400);
    await http.post(tg('/discover-chats'), admin).expect(400);
  });
});

describe('удаление', () => {
  it('DELETE убирает интеграцию вместе с настройками; повтор не ошибка', async () => {
    await http.put(tg(), admin).send({ botToken: TOKEN, chats: [{ id: '5', title: null }] }).expect(200);
    await http.delete(tg(), admin).expect(204);
    await http.delete(tg(), admin).expect(204);
    expect(await http.get(tg(), admin).expect(200)).toMatchObject({ body: { hasToken: false, chats: [] } });
    const list = (await http.get(url(), admin).expect(200)).body as IntegrationSummary[];
    expect(list[0]).toMatchObject({ configured: false, enabled: false });
  });
});
