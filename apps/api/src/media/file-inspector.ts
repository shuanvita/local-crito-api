import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { createPurify } from '../common/purify.js';

export interface AllowedType {
  ext: string;
  mime: string;
  /** Максимальный размер в байтах. */
  maxBytes: number;
}

const MB = 1024 * 1024;

/** Разрешённые типы по реальному содержимому файла. Расширение и Content-Type клиента не доверяем. */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  'image/jpeg': { ext: 'jpg', mime: 'image/jpeg', maxBytes: 10 * MB },
  'image/png': { ext: 'png', mime: 'image/png', maxBytes: 10 * MB },
  'image/webp': { ext: 'webp', mime: 'image/webp', maxBytes: 10 * MB },
  'image/gif': { ext: 'gif', mime: 'image/gif', maxBytes: 10 * MB },
  'image/avif': { ext: 'avif', mime: 'image/avif', maxBytes: 10 * MB },
  'image/svg+xml': { ext: 'svg', mime: 'image/svg+xml', maxBytes: 1 * MB },
  'application/pdf': { ext: 'pdf', mime: 'application/pdf', maxBytes: 20 * MB },
};

/** Максимум среди всех типов: лимит для multer. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(ALLOWED_TYPES).map((t) => t.maxBytes));

export const MIME_BY_EXT = Object.fromEntries(
  Object.values(ALLOWED_TYPES).map((type) => [type.ext, type.mime]),
);

export interface InspectedFile {
  buffer: Buffer;
  type: AllowedType;
  width?: number;
  height?: number;
}

const purify = createPurify();

/** SVG — это XML, `file-type` его не определяет: ищем корневой элемент `<svg`. */
function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 2048).toString('utf8').replace(/^﻿/, '');
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head);
}

/** Активное содержимое, которому нечего делать в иллюстрации: такой SVG отклоняем, а не чиним. */
const FORBIDDEN_SVG_ELEMENTS = /<s*(script|foreignObject|iframe|embed|object)[s>/]/i;

/**
 * Удаляет из SVG скрипты, обработчики событий, `foreignObject` и внешние ссылки.
 * Остальное (формы, градиенты, фильтры, стили) сохраняется.
 */
export function sanitizeSvg(source: string): string {
  if (FORBIDDEN_SVG_ELEMENTS.test(source)) {
    throw new BadRequestException('SVG содержит недопустимые элементы (script, foreignObject, iframe, embed, object)');
  }
  const clean = purify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Разбор как XML, а не HTML: иначе невалидная разметка может исказить содержимое.
    PARSER_MEDIA_TYPE: 'image/svg+xml',
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'embed', 'object'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick'],
  });
  if (!/<svg[\s>]/i.test(clean)) {
    throw new BadRequestException('SVG не содержит допустимого содержимого');
  }
  return clean;
}

/**
 * Проверяет файл: определяет тип по сигнатуре, применяет лимиты, санитизирует SVG,
 * убирает EXIF (в том числе GPS) у JPEG и определяет размеры изображения.
 */
export async function inspectFile(input: Buffer): Promise<InspectedFile> {
  if (input.length === 0) throw new BadRequestException('Пустой файл');

  let mime = (await fileTypeFromBuffer(input))?.mime;
  // Текст с <?xml ...?> file-type считает application/xml: SVG распознаём сами.
  if ((!mime || mime === 'application/xml') && looksLikeSvg(input)) mime = 'image/svg+xml';

  const type = mime ? ALLOWED_TYPES[mime] : undefined;
  if (!type) {
    throw new BadRequestException(
      `Тип файла не поддерживается. Разрешено: ${Object.values(ALLOWED_TYPES).map((t) => t.ext).join(', ')}`,
    );
  }
  if (input.length > type.maxBytes) {
    throw new PayloadTooLargeException(`Файл больше ${Math.round(type.maxBytes / MB)} МБ`);
  }

  if (type.ext === 'svg') {
    const buffer = Buffer.from(sanitizeSvg(input.toString('utf8')), 'utf8');
    return { buffer, type, ...(await dimensions(buffer)) };
  }
  if (type.ext === 'pdf') return { buffer: input, type };

  try {
    const metadata = await sharp(input).metadata();
    let buffer = input;
    if (type.ext === 'jpg' && metadata.exif) {
      // rotate() применяет ориентацию из EXIF, после чего метаданные не копируются в результат.
      buffer = await sharp(input).rotate().jpeg({ quality: 92 }).toBuffer();
    }
    return { buffer, type, ...(await dimensions(buffer)) };
  } catch {
    throw new BadRequestException('Изображение повреждено или не читается');
  }
}

async function dimensions(buffer: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const { width, height } = await sharp(buffer).metadata();
    return { width, height };
  } catch {
    return {};
  }
}
