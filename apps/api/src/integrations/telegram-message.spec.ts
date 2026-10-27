import { buildSubmissionMessage, escapeHtml } from './telegram-message.js';
import type { SubmissionEvent } from './telegram-message.js';

const event = (fields: SubmissionEvent['fields'], extra: Partial<SubmissionEvent> = {}): SubmissionEvent => ({
  projectSlug: 'rucode',
  projectName: 'Rucode',
  submissionId: 'sub1',
  formKey: 'participation',
  pageUrl: 'https://rucode.net/',
  fields,
  ...extra,
});

describe('escapeHtml', () => {
  it('экранирует три служебных символа', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });
});

describe('buildSubmissionMessage', () => {
  it('заголовок, страница и ссылка на заявку: ни полей, ни проекта', () => {
    const text = buildSubmissionMessage(event({ name: 'Иван', email: 'a@b.ru' }), { adminBaseUrl: 'https://edu.mipt.ru/adm/cms-admin/' });
    expect(text).toBe(
      '<b>Поступила новая заявка с сайта</b>\n\nСтраница: https://rucode.net/\n\n<a href="https://edu.mipt.ru/adm/cms-admin/rucode/requests?id=sub1">Открыть заявку в админке</a>',
    );
  });

  it('адрес страницы экранируется и обрезается', () => {
    const text = buildSubmissionMessage(event({}, { pageUrl: `https://x/?a=1&b=<2>${'я'.repeat(600)}` }));
    expect(text).toContain('Страница: https://x/?a=1&amp;b=&lt;2&gt;');
    expect(text).not.toContain('я'.repeat(501));
  });

  it('кавычки в базовом адресе админки экранируются', () => {
    const text = buildSubmissionMessage(event({}), { adminBaseUrl: 'https://x.ru/"onmouseover="y' });
    expect(text).not.toMatch(/href="[^"]*"[^>]*onmouseover/);
    expect(text).toContain('&quot;');
  });

  it('без страницы и базового адреса остаётся один заголовок', () => {
    expect(buildSubmissionMessage(event({}, { pageUrl: null }))).toBe('<b>Поступила новая заявка с сайта</b>');
  });
});
