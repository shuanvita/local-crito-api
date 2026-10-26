import { buildSubmissionMessage, escapeHtml, TELEGRAM_MESSAGE_LIMIT } from './telegram-message.js';
import type { SubmissionEvent } from './telegram-message.js';

const event = (fields: SubmissionEvent['fields'], extra: Partial<SubmissionEvent> = {}): SubmissionEvent => ({
  projectSlug: 'rucode',
  projectName: 'Rucode',
  submissionId: 'sub1',
  formKey: 'participation',
  pageUrl: null,
  fields,
  ...extra,
});

describe('escapeHtml', () => {
  it('экранирует три служебных символа', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });
});

describe('buildSubmissionMessage', () => {
  it('содержит форму, проект и все поля; списки через запятую', () => {
    const text = buildSubmissionMessage(event({ name: 'Иван', events: ['a', 'b'] }));
    expect(text).toContain('<b>Новая заявка</b>: participation');
    expect(text).toContain('Проект: Rucode');
    expect(text).toContain('<b>name:</b> Иван');
    expect(text).toContain('<b>events:</b> a, b');
  });

  it('использует человеческое название формы, если оно задано', () => {
    const text = buildSubmissionMessage(event({ name: 'x' }), { formLabels: { participation: 'Участие' } });
    expect(text).toContain('<b>Новая заявка</b>: Участие');
  });

  it('HTML из полей, названия проекта и страницы экранируется', () => {
    const text = buildSubmissionMessage(
      event({ name: '<img src=x onerror=alert(1)>', '<k>': '</b><a href="x">' }, { projectName: 'A<B', pageUrl: 'https://x/?a=1&b=<2>' }),
    );
    expect(text).not.toContain('<img');
    expect(text).not.toContain('<a href="x">');
    expect(text).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(text).toContain('A&lt;B');
    expect(text).toContain('Страница: https://x/?a=1&amp;b=&lt;2&gt;');
    expect(text).toContain('<b>&lt;k&gt;:</b>');
  });

  it('ссылка на заявку в админке строится из базового адреса, кавычки в ней экранируются', () => {
    const text = buildSubmissionMessage(event({ name: 'x' }), { adminBaseUrl: 'https://edu.mipt.ru/adm/cms-admin/' });
    expect(text).toContain('<a href="https://edu.mipt.ru/adm/cms-admin/rucode/requests?id=sub1">Открыть в админке</a>');
    const quoted = buildSubmissionMessage(event({ name: 'x' }), { adminBaseUrl: 'https://x.ru/"onmouseover="y' });
    expect(quoted).not.toMatch(/href="[^"]*"[^>]*onmouseover/);
    expect(quoted).toContain('&quot;');
  });

  it('без базового адреса ссылки нет', () => {
    expect(buildSubmissionMessage(event({ name: 'x' }))).not.toContain('<a ');
  });

  it('не превышает лимит Telegram и не режет теги: лишние поля заменяются счётчиком', () => {
    const fields = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`field${i}`, '&'.repeat(500)]));
    const text = buildSubmissionMessage(event(fields), { adminBaseUrl: 'https://x.ru' });
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(text).toMatch(/… и ещё полей: \d+/);
    // Каждый открытый <b> закрыт: строки обрезаются целиком.
    expect(text.match(/<b>/g)?.length).toBe(text.match(/<\/b>/g)?.length);
    expect(text).toContain('Открыть в админке');
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'ключ формы «%s» из публичной заявки не ломает сборку: берётся сам ключ',
    (formKey) => {
      const text = buildSubmissionMessage(event({ name: 'x' }, { formKey }), { formLabels: {} });
      expect(text).toContain(`<b>Новая заявка</b>: ${formKey}`);
    },
  );

  it('название для ключа __proto__ работает, если оно задано явно', () => {
    const formLabels = Object.fromEntries([['__proto__', 'Прото']]);
    const text = buildSubmissionMessage(event({ name: 'x' }, { formKey: '__proto__' }), { formLabels });
    expect(text).toContain('<b>Новая заявка</b>: Прото');
  });

  it('обрезка не разрезает пару суррогатов (эмодзи)', () => {
    const text = buildSubmissionMessage(event({ message: `${'я'.repeat(498)}😀😀😀` }));
    expect(text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
  });

  it('длинное значение поля обрезается', () => {
    const text = buildSubmissionMessage(event({ message: 'я'.repeat(2000) }));
    expect(text).toContain('я'.repeat(499) + '…');
    expect(text).not.toContain('я'.repeat(501));
  });
});
