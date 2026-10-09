import type { JsonSchema } from '@crito/contract';
import { createPurify } from '../common/purify.js';

/**
 * Что разрешено в rich-text. Редактор админки умеет заголовки, списки, цитаты, выделение и ссылки;
 * `class` нужен для существующего оформления (`<span class>`, `<a class>`), `style` и `on*` запрещены.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'span',
  'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'hr',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];
const ALLOWED_TARGETS = new Set(['_blank', '_self']);

const purify = createPurify();

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'A') return;
  const target = node.getAttribute('target');
  if (target && !ALLOWED_TARGETS.has(target)) node.removeAttribute('target');
  // Ссылка в новой вкладке не должна получать доступ к window.opener.
  if (node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
});

/** Очищает HTML поля rich-text. Операция идемпотентна: повторный вызов ничего не меняет. */
export function sanitizeRichText(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Допустим ли адрес в полях `link` и `image`: относительные пути, якоря, http(s), mailto, tel.
 * Браузеры игнорируют пробелы и управляющие символы внутри схемы (`java\tscript:`), поэтому их убираем.
 */
export function isSafeUrl(value: string): boolean {
  const compact = [...value]
    .filter((char) => (char.codePointAt(0) ?? 0) > 0x20)
    .join('');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1];
  return !scheme || SAFE_SCHEMES.has(scheme.toLowerCase());
}

const variants = (node: JsonSchema) => [node, ...(node.anyOf ?? []), ...(node.oneOf ?? [])];
const hasField = (node: JsonSchema, field: string) => variants(node).some((variant) => variant['x-field'] === field);

export interface SanitizeResult {
  data: unknown;
  /** Пути полей с недопустимыми адресами. */
  errors: string[];
}

/**
 * Обходит данные блока по его JSON Schema: очищает строки с `x-field: richtext`
 * и проверяет адреса в полях `link` и `image`. Остальные значения возвращаются как есть.
 */
export function sanitizeBlockData(data: unknown, schema: JsonSchema): SanitizeResult {
  const errors: string[] = [];

  const walk = (value: unknown, node: JsonSchema | undefined, path: string): unknown => {
    if (!node) return value;

    if (typeof value === 'string') {
      if (hasField(node, 'richtext')) return sanitizeRichText(value);
      if ((hasField(node, 'link') || hasField(node, 'image')) && !isSafeUrl(value)) errors.push(path);
      return value;
    }

    if (Array.isArray(value)) {
      const itemNode = variants(node).find((variant) => variant.items)?.items;
      return value.map((item, index) => walk(item, itemNode, `${path}[${index}]`));
    }

    if (value && typeof value === 'object') {
      const properties = variants(node).find((variant) => variant.properties)?.properties;
      if (!properties) return value;
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          walk(child, properties[key], `${path}.${key}`),
        ]),
      );
    }

    return value;
  };

  return { data: walk(data, schema, 'data'), errors };
}
