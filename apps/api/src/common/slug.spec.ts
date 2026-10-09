import { INDEX_SLUG, normalizeSlug, tryNormalizeSlug } from './slug.js';

describe('normalizeSlug', () => {
  it('приводит пустой путь и "/" к /index', () => {
    expect(normalizeSlug('')).toBe(INDEX_SLUG);
    expect(normalizeSlug('/')).toBe(INDEX_SLUG);
  });

  it('нормализует лишние слэши', () => {
    expect(normalizeSlug('champ')).toBe('/champ');
    expect(normalizeSlug('//news///2026/')).toBe('/news/2026');
  });

  it.each(['/../etc', '/a/./b', '/Champ', '/a b', '/%2e%2e', '/-a'])('отклоняет %s', (input) => {
    expect(() => normalizeSlug(input)).toThrow();
  });
});

describe('tryNormalizeSlug', () => {
  it('возвращает нормализованный адрес или null, но не бросает', () => {
    expect(tryNormalizeSlug('champ')).toBe('/champ');
    expect(tryNormalizeSlug('')).toBe('/index');
    expect(tryNormalizeSlug('//news///2026/')).toBe('/news/2026');
  });

  it.each(['Champ', 'wp-login.php', 'a b', '../etc', 'тест', '/a/./b', '-a', 'a%2fb'])('для %j возвращает null', (input) => {
    expect(tryNormalizeSlug(input)).toBeNull();
  });
});
