import type { FormSubmissionDetail, FormSubmissionList } from '@crito/contract';
import { client, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

/** Заявки с форм сайта. У файла свои проекты, чтобы не зависеть от других сценариев. */
const PROJECT = 'reqproj';
const OTHER = 'reqother';

let ctx: TestContext;
let http: ReturnType<typeof client>;
let admin: string;
let owner: string;
let pagesOnly: string;
let otherOwner: string;

const publicUrl = (project = PROJECT) => `/public/${project}/requests`;
const listUrl = (project = PROJECT, query = '') => `/projects/${project}/requests${query}`;

const submit = (fields: Record<string, string | string[]>, extra: Record<string, unknown> = {}, project = PROJECT) =>
  http.post(publicUrl(project)).send({ form: 'consortium', fields, ...extra });

beforeAll(async () => {
  ctx = await createTestContext();
  http = client(ctx.app);
  admin = await ctx.login('req-admin@e2e.test', { superAdmin: true });
  owner = await ctx.login('req-owner@e2e.test', { grants: [{ project: PROJECT, scope: 'project' }] });
  pagesOnly = await ctx.login('req-pages@e2e.test', {
    grants: [{ project: PROJECT, scope: 'pages', pageIds: ['any'] }],
  });
  otherOwner = await ctx.login('req-other@e2e.test', { grants: [{ project: OTHER, scope: 'project' }] });

  await http.post('/projects', admin).send({ slug: PROJECT, name: 'Requests' }).expect(201);
  await http.post('/projects', admin).send({ slug: OTHER, name: 'Other' }).expect(201);
});

afterAll(async () => {
  await ctx.app.close();
});

describe('приём заявок с формы сайта', () => {
  it('принимает заявку без авторизации', async () => {
    const res = await submit(
      { name: ' Иван Петров ', email: 'ivan@example.com', phone: '+7 900 000-00-00', audience: ['школы', 'вузы'] },
      { pageUrl: 'https://rucode.example/consortium' },
    ).expect(201);
    expect(res.body).toEqual({ accepted: true });
  });

  it('неизвестный проект: 404', async () => {
    await submit({ name: 'x' }, {}, 'no-such-project').expect(404);
  });

  it('невалидное тело: 400', async () => {
    await http.post(publicUrl()).send({ fields: { name: 'x' } }).expect(400); // нет form
    await http.post(publicUrl()).send({ form: 'bad form!', fields: { name: 'x' } }).expect(400);
    await http.post(publicUrl()).send({ form: 'consortium', fields: {} }).expect(400);
    await http.post(publicUrl()).send({ form: 'consortium', fields: { name: 5 } }).expect(400);
    await http.post(publicUrl()).send({ form: 'consortium', fields: { name: { nested: 'x' } } }).expect(400);
    await http.post(publicUrl()).send({ form: 'consortium', fields: { name: 'x'.repeat(5001) } }).expect(400);
  });

  it('ловушка для ботов: ответ как при успехе, но заявка не сохраняется', async () => {
    const before = (await http.get(listUrl(), owner).expect(200)).body as FormSubmissionList;
    const res = await submit({ name: 'Бот' }, { website: 'http://spam.example' }).expect(201);
    expect(res.body).toEqual({ accepted: true });
    const after = (await http.get(listUrl(), owner).expect(200)).body as FormSubmissionList;
    expect(after.total).toBe(before.total);
  });
});

describe('чтение заявок менеджерами', () => {
  let firstId: string;

  beforeAll(async () => {
    await submit({ name: 'Анна Сидорова', email: 'anna@example.com', city: 'Казань' }, { pageUrl: '/news' }).expect(201);
    await submit({ name: 'Борис', email: 'boris@example.com' }, {}).expect(201);
    await http
      .post(publicUrl())
      .send({ form: 'contacts', fields: { name: 'Вера', message: 'Нужна консультация по курсу' } })
      .expect(201);
  });

  it('список: новые сверху, контакты вынесены, есть список форм и счётчик', async () => {
    const body = (await http.get(listUrl(), owner).expect(200)).body as FormSubmissionList;
    expect(body.total).toBe(4);
    expect(body.items.map((item) => item.name)).toEqual(['Вера', 'Борис', 'Анна Сидорова', 'Иван Петров']);
    expect(body.forms).toEqual(['consortium', 'contacts']);
    expect(body.nextCursor).toBeNull();
    const ivan = body.items[3];
    expect(ivan).toMatchObject({
      form: 'consortium',
      email: 'ivan@example.com',
      phone: '+7 900 000-00-00',
      pageUrl: 'https://rucode.example/consortium',
    });
    expect(ivan).not.toHaveProperty('fields');
    firstId = ivan.id;
  });

  it('фильтр по форме', async () => {
    const body = (await http.get(listUrl(PROJECT, '?form=contacts'), owner).expect(200)).body as FormSubmissionList;
    expect(body.items.map((item) => item.name)).toEqual(['Вера']);
    expect(body.total).toBe(1);
  });

  it('поиск по любому полю без учёта регистра', async () => {
    const byCity = (await http.get(listUrl(PROJECT, `?q=${encodeURIComponent('КАЗАНЬ')}`), owner).expect(200))
      .body as FormSubmissionList;
    expect(byCity.items.map((item) => item.name)).toEqual(['Анна Сидорова']);
    const byMessage = (await http.get(listUrl(PROJECT, `?q=${encodeURIComponent('консультация')}`), owner).expect(200))
      .body as FormSubmissionList;
    expect(byMessage.items.map((item) => item.name)).toEqual(['Вера']);
  });

  it('фильтр по датам: границы from включительно, to исключительно', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const q = (query: string) => http.get(listUrl(PROJECT, query), owner).expect(200);
    expect(((await q(`?from=${encodeURIComponent(future)}`)).body as FormSubmissionList).total).toBe(0);
    expect(((await q(`?to=${encodeURIComponent(past)}`)).body as FormSubmissionList).total).toBe(0);
    expect(((await q(`?from=${encodeURIComponent(past)}&to=${encodeURIComponent(future)}`)).body as FormSubmissionList).total).toBe(4);
    await http.get(listUrl(PROJECT, '?from=вчера'), owner).expect(400);
  });

  it('постраничная выдача по курсору', async () => {
    const first = (await http.get(listUrl(PROJECT, '?limit=3'), owner).expect(200)).body as FormSubmissionList;
    expect(first.items).toHaveLength(3);
    expect(first.total).toBe(4);
    expect(first.nextCursor).toBe(first.items[2].id);
    const second = (await http.get(listUrl(PROJECT, `?limit=3&cursor=${first.nextCursor}`), owner).expect(200))
      .body as FormSubmissionList;
    expect(second.items.map((item) => item.name)).toEqual(['Иван Петров']);
    expect(second.nextCursor).toBeNull();
  });

  it('просмотр заявки: все поля как отправлены', async () => {
    const body = (await http.get(`/projects/${PROJECT}/requests/${firstId}`, owner).expect(200))
      .body as FormSubmissionDetail;
    expect(body.id).toBe(firstId);
    expect(body.fields).toEqual({
      name: 'Иван Петров',
      email: 'ivan@example.com',
      phone: '+7 900 000-00-00',
      audience: ['школы', 'вузы'],
    });
  });

  it('несуществующая заявка: 404', async () => {
    await http.get(`/projects/${PROJECT}/requests/nope`, owner).expect(404);
  });

  it('HTML в полях не интерпретируется: хранится и отдаётся как текст', async () => {
    await submit({ name: '<img src=x onerror=alert(1)>' }, { form: 'xss' }).expect(201);
    const body = (await http.get(listUrl(PROJECT, '?form=xss'), owner).expect(200)).body as FormSubmissionList;
    expect(body.items[0].name).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('права и изоляция проектов', () => {
  let projectRequestId: string;

  beforeAll(async () => {
    projectRequestId = ((await http.get(listUrl(), owner).expect(200)).body as FormSubmissionList).items[0].id;
    await submit({ name: 'Чужая заявка', email: 'other@example.com' }, {}, OTHER).expect(201);
  });

  it('заявки одного проекта не видны в другом', async () => {
    const mine = (await http.get(listUrl(PROJECT, '?q=other@example.com'), owner).expect(200)).body as FormSubmissionList;
    expect(mine.total).toBe(0);

    const theirs = (await http.get(listUrl(OTHER), otherOwner).expect(200)).body as FormSubmissionList;
    expect(theirs.items.map((item) => item.name)).toEqual(['Чужая заявка']);
    expect(theirs.items.some((item) => item.id === projectRequestId)).toBe(false);
  });

  it('заявку проекта нельзя открыть через адрес другого проекта', async () => {
    // Суперадминистратор видит оба проекта, но по адресу чужого проекта заявки нет.
    await http.get(`/projects/${OTHER}/requests/${projectRequestId}`, admin).expect(404);
    await http.get(`/projects/${PROJECT}/requests/${projectRequestId}`, admin).expect(200);
  });

  it('курсор из другого проекта не раскрывает чужие заявки', async () => {
    const res = await http.get(listUrl(OTHER, `?cursor=${projectRequestId}`), otherOwner).expect(200);
    const body = res.body as FormSubmissionList;
    expect(body.items.some((item) => item.id === projectRequestId)).toBe(false);
  });

  it('менеджер другого проекта: 403 на список и на заявку', async () => {
    await http.get(listUrl(PROJECT), otherOwner).expect(403);
    await http.get(`/projects/${PROJECT}/requests/${projectRequestId}`, otherOwner).expect(403);
  });

  it('доступ только к страницам заявок не даёт: 403', async () => {
    await http.get(listUrl(PROJECT), pagesOnly).expect(403);
    await http.get(`/projects/${PROJECT}/requests/${projectRequestId}`, pagesOnly).expect(403);
  });

  it('без сессии: 401', async () => {
    await http.get(listUrl(PROJECT)).expect(401);
  });

  it('суперадминистратор: несуществующий проект даёт 404', async () => {
    await http.get(listUrl('no-such-project'), admin).expect(404);
  });
});

describe('удаление заявок', () => {
  let id: string;
  let otherId: string;
  const idOf = async (form: string, token: string, project = PROJECT) =>
    ((await http.get(listUrl(project, `?form=${form}`), token).expect(200)).body as FormSubmissionList).items[0].id;

  beforeAll(async () => {
    await submit({ name: 'Удаляемая' }, { form: 'to-delete' }).expect(201);
    await submit({ name: 'Чужая удаляемая' }, { form: 'to-delete-other' }, OTHER).expect(201);
    id = await idOf('to-delete', admin);
    otherId = await idOf('to-delete-other', admin, OTHER);
  });

  it('владелец проекта и редактор страниц удалить не могут: 403, заявка остаётся', async () => {
    await http.delete(`/projects/${PROJECT}/requests/${id}`, owner).expect(403);
    await http.delete(`/projects/${PROJECT}/requests/${id}`, pagesOnly).expect(403);
    await http.get(`/projects/${PROJECT}/requests/${id}`, owner).expect(200);
  });

  it('без сессии: 401', async () => {
    await http.delete(`/projects/${PROJECT}/requests/${id}`).expect(401);
  });

  it('заявку нельзя удалить через адрес другого проекта: 404', async () => {
    await http.delete(`/projects/${OTHER}/requests/${id}`, admin).expect(404);
    await http.get(`/projects/${PROJECT}/requests/${id}`, owner).expect(200);
  });

  it('администратор удаляет заявку: 204, она пропадает из списка и просмотра; чужие целы', async () => {
    await http.delete(`/projects/${PROJECT}/requests/${id}`, admin).expect(204);
    await http.get(`/projects/${PROJECT}/requests/${id}`, owner).expect(404);
    const list = (await http.get(listUrl(PROJECT, '?form=to-delete'), owner).expect(200)).body as FormSubmissionList;
    expect(list.total).toBe(0);
    await http.get(`/projects/${OTHER}/requests/${otherId}`, admin).expect(200);
  });

  it('повторное удаление и неизвестная заявка: 404', async () => {
    await http.delete(`/projects/${PROJECT}/requests/${id}`, admin).expect(404);
    await http.delete(`/projects/${PROJECT}/requests/nope`, admin).expect(404);
    await http.delete('/projects/no-such-project/requests/nope', admin).expect(404);
  });
});

describe('подписи полей', () => {
  const detailOf = async (form: string) => {
    const list = (await http.get(listUrl(PROJECT, `?form=${form}`), owner).expect(200)).body as FormSubmissionList;
    return (await http.get(`/projects/${PROJECT}/requests/${list.items[0].id}`, owner).expect(200))
      .body as FormSubmissionDetail;
  };

  it('сохраняются и отдаются в просмотре заявки; в списке их нет', async () => {
    await submit(
      { name: 'Мария', audience: 'Да', promotion: ['Блог', 'СМИ'] },
      {
        form: 'labelled',
        labels: { name: 'ФИО', audience: 'Есть ли возможность привлечь 50 участников?', promotion: 'Как продвигаете?' },
      },
    ).expect(201);
    const detail = await detailOf('labelled');
    expect(detail.labels).toEqual({
      name: 'ФИО',
      audience: 'Есть ли возможность привлечь 50 участников?',
      promotion: 'Как продвигаете?',
    });
    const list = (await http.get(listUrl(PROJECT, '?form=labelled'), owner).expect(200)).body as FormSubmissionList;
    expect(list.items[0]).not.toHaveProperty('labels');
  });

  it('без подписей (старый сайт): пустой объект', async () => {
    await submit({ name: 'Без подписей' }, { form: 'unlabelled' }).expect(201);
    expect((await detailOf('unlabelled')).labels).toEqual({});
  });

  it('кривые подписи не теряют заявку: лишние и неверные отбрасываются', async () => {
    await submit(
      { name: 'Кривые' },
      { form: 'badlabels', labels: { name: ' ФИО ', ghost: 'Чужое поле', other: 5 } },
    ).expect(201);
    expect((await detailOf('badlabels')).labels).toEqual({ name: 'ФИО' });
  });

  it('подписи не строкой-объектом: 400, как и другие неверные формы тела', async () => {
    await http.post(publicUrl()).send({ form: 'f', fields: { a: 'b' }, labels: 'x' }).expect(400);
  });
});
