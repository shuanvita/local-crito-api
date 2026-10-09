import { BadRequestException } from '@nestjs/common';

/** Главная страница хранится как "/index": так её запрашивает фронт (`/api/cms/index`). */
export const INDEX_SLUG = '/index';

/**
 * Приводит путь к каноническому виду: "/champ", "/news/2026", "/index".
 * Запрещает `..`, пустые сегменты и всё, кроме строчных латинских букв, цифр, `-` и `_`.
 * Для админки: неверный адрес это ошибка запроса (400).
 */
export function normalizeSlug(input: string): string {
  const slug = tryNormalizeSlug(input);
  if (slug === null) throw new BadRequestException(`Недопустимый slug: "${input}"`);
  return slug;
}

/** Как `normalizeSlug`, но без исключения: для публичного чтения, где неверный адрес значит «страницы нет». */
export function tryNormalizeSlug(input: string): string | null {
  const parts = input.split('/').filter((part) => part !== '');
  if (parts.length === 0) return INDEX_SLUG;
  if (!parts.every((part) => /^[a-z0-9][a-z0-9_-]*$/.test(part))) return null;
  return `/${parts.join('/')}`;
}
