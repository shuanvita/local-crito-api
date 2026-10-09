import type { Readable } from 'node:stream';

/**
 * Хранилище файлов. Реализации: локальный диск (`LocalStorage`), позже S3-совместимое.
 * Ключи имеют вид `<project>/<sha256>.<ext>` и валидируются через `assertValidKey`.
 */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Поток файла или `null`, если файла нет. */
  abstract get(key: string): Promise<Readable | null>;
  abstract delete(key: string): Promise<void>;
  abstract exists(key: string): Promise<boolean>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/;

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function assertValidKey(key: string): void {
  if (!isValidKey(key)) throw new Error(`Недопустимый ключ хранилища: ${key}`);
}
