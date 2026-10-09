import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LocalStorage, resolveStorageDir } from './local.storage.js';

const HASH = 'a'.repeat(64);
const key = `rucode/${HASH}.png`;

let dir: string;
let storage: LocalStorage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'crito-storage-'));
  storage = new LocalStorage(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const read = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

describe('LocalStorage', () => {
  it('сохраняет, читает и удаляет файл', async () => {
    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, Buffer.from('hello'));
    expect(await storage.exists(key)).toBe(true);
    expect((await read((await storage.get(key))!)).toString()).toBe('hello');
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it.each(['../etc/passwd', 'rucode/../../x.png', 'rucode/short.png', `/${HASH}.png`, `rucode/${HASH}.png/../x`])(
    'отклоняет небезопасный ключ %s',
    async (bad) => {
      await expect(storage.put(bad, Buffer.from('x'))).rejects.toThrow();
      await expect(storage.get(bad)).rejects.toThrow();
    },
  );

  it('удаление несуществующего файла не падает', async () => {
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });
});

describe('resolveStorageDir', () => {
  const appRoot = resolve(tmpdir(), 'crito-app-root');

  it('относительный путь считается от корня приложения, а не от текущей папки', () => {
    expect(resolveStorageDir('./uploads', appRoot)).toBe(resolve(appRoot, 'uploads'));
    expect(resolveStorageDir('data/media', appRoot)).toBe(resolve(appRoot, 'data/media'));
  });

  it('по умолчанию uploads в корне приложения', () => {
    expect(resolveStorageDir(undefined, appRoot)).toBe(resolve(appRoot, 'uploads'));
    expect(resolveStorageDir('  ', appRoot)).toBe(resolve(appRoot, 'uploads'));
  });

  it('абсолютный путь не меняется', () => {
    const absolute = resolve(tmpdir(), 'media-absolute');
    expect(resolveStorageDir(absolute, appRoot)).toBe(absolute);
  });
});
