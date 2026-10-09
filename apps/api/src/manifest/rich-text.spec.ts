import { isSafeUrl, sanitizeBlockData, sanitizeRichText } from './rich-text.js';
import type { JsonSchema } from '@crito/contract';

const DANGEROUS = /\bon\w+\s*=|javascript:|<script|<img|<iframe|<style|<svg|<form|<object|<embed/i;

describe('sanitizeRichText', () => {
  it('сохраняет разрешённую разметку и оформление', () => {
    const html =
      '<p>Текст <b>жирный</b>, <i>курсив</i> и <span class="text-yellow-primary">цвет</span><br>перенос</p>' +
      '<ul><li>один</li><li>два</li></ul><a class="underline" href="/champ">чемпионат</a>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('сохраняет сущности', () => {
    expect(sanitizeRichText('<p>a&nbsp;b &amp; c &lt; d</p>')).toBe('<p>a&nbsp;b &amp; c &lt; d</p>');
  });

  it.each([
    ['<script>alert(1)</script><p>ок</p>', '<p>ок</p>'],
    ['<p onclick="x()" style="color:red" class="c">т</p>', '<p class="c">т</p>'],
    ['<a href="javascript:alert(1)">х</a>', '<a>х</a>'],
    ['<a href="  JaVa\tScRiPt:alert(1)">х</a>', '<a>х</a>'],
    ['<a href="data:text/html,<script>alert(1)</script>">х</a>', '<a>х</a>'],
  ])('вычищает опасное: %s', (input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected);
  });

  it.each([
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)><circle/></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<style>body{display:none}</style>x',
    '<form action="https://evil.example"><input name=p></form>',
    '<svg><style><img src=x onerror=alert(1)></style></svg>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">',
  ])('не оставляет активного содержимого: %s', (input) => {
    expect(sanitizeRichText(input)).not.toMatch(DANGEROUS);
  });

  it('разрешает только target _blank и _self и защищает новую вкладку', () => {
    expect(sanitizeRichText('<a href="https://x.example" target="_blank">x</a>')).toBe(
      '<a href="https://x.example" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichText('<a href="/a" target="evil">x</a>')).toBe('<a href="/a">x</a>');
    expect(sanitizeRichText('<a href="/a" rel="opener">x</a>')).toBe('<a href="/a" rel="opener">x</a>');
  });

  it('идемпотентна', () => {
    const samples = [
      '<p>a<br>b</p><a href="https://x.example" target="_blank">x</a>',
      '<div><p>вложено</p></div>&nbsp;',
      '<script>1</script><b>b</b>',
      '',
    ];
    for (const sample of samples) {
      const once = sanitizeRichText(sample);
      expect(sanitizeRichText(once)).toBe(once);
    }
  });
});

describe('isSafeUrl', () => {
  it.each(['/page', '#anchor', '?q=1', 'page.html', 'https://x.example/a', 'http://x.example', 'mailto:a@b.c', 'tel:+7000', ''])(
    'разрешает %s',
    (url) => expect(isSafeUrl(url)).toBe(true),
  );

  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', ' java\tscript:alert(1)', 'data:text/html;base64,AAA', 'vbscript:x', 'file:///etc/passwd'])(
    'запрещает %j',
    (url) => expect(isSafeUrl(url)).toBe(false),
  );
});

describe('sanitizeBlockData', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string', 'x-field': 'richtext' },
      cover: { type: 'string', 'x-field': 'image' },
      cta: { type: 'string', 'x-field': 'link' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', 'x-field': 'richtext' },
            link: { anyOf: [{ type: 'string', 'x-field': 'link' }, { type: 'null' }] },
          },
        },
      },
    },
  };

  it('очищает только поля richtext, в том числе во вложенных списках', () => {
    const { data, errors } = sanitizeBlockData(
      {
        title: '<b>не трогаем</b> <script>',
        body: '<p>ok</p><script>x</script>',
        items: [{ content: '<img src=x onerror=1>текст' }, { content: '<b>b</b>' }],
      },
      schema,
    );
    expect(errors).toEqual([]);
    expect(data).toEqual({
      title: '<b>не трогаем</b> <script>',
      body: '<p>ok</p>',
      items: [{ content: 'текст' }, { content: '<b>b</b>' }],
    });
  });

  it('сообщает пути полей с опасными адресами', () => {
    const { errors } = sanitizeBlockData(
      { cover: 'javascript:alert(1)', cta: '/ok', items: [{ link: 'https://ok.example' }, { link: 'javascript:1' }] },
      schema,
    );
    expect(errors).toEqual(['data.cover', 'data.items[1].link']);
  });

  it('не падает на неожиданных значениях и неизвестных полях', () => {
    const { data, errors } = sanitizeBlockData({ body: 5, extra: { a: ['x'] }, items: 'нет' }, schema);
    expect(errors).toEqual([]);
    expect(data).toEqual({ body: 5, extra: { a: ['x'] }, items: 'нет' });
  });
});
