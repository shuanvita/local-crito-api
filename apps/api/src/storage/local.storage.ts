import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { StorageService, assertValidKey } from './storage.service.js';

/**
 * Каталог хранилища. Относительный путь считается от корня приложения (apps/api), а не от папки,
 * из которой запущен процесс: иначе запуск из другого места «теряет» файлы. На проде лучше абсолютный путь.
 */
export function resolveStorageDir(configured: string | undefined, appRoot: string): string {
  const dir = configured?.trim() || './uploads';
  return isAbsolute(dir) ? dir : resolve(appRoot, dir);
}

/** Хранение на локальном диске. Подходит для разработки и небольших инсталляций без CDN. */
export class LocalStorage extends StorageService {
  private readonly root: string;

  constructor(root: string) {
    super();
    this.root = resolve(root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Readable | null> {
    const path = this.pathFor(key);
    return (await this.exists(key)) ? createReadStream(path) : null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.pathFor(key))).isFile();
    } catch {
      return false;
    }
  }

  /** Путь внутри корня; ключ уже проверен шаблоном, а проверка префикса защищает от выхода за корень. */
  private pathFor(key: string): string {
    assertValidKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error('Путь вне хранилища');
    return path;
  }
}
