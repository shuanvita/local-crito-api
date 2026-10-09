import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { SecretBox, parseSecretsKey } from './secret-box.js';

const keyB64 = randomBytes(32).toString('base64');
const config = (values: Record<string, string | undefined>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

const box = new SecretBox(config({ SECRETS_KEY: keyB64 }));
const CTX = 'Project.revalidateSecret';

describe('SecretBox', () => {
  it('шифрует и расшифровывает, не оставляя открытого текста', () => {
    const encrypted = box.encrypt('topsecret', CTX);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted).not.toContain('topsecret');
    expect(box.decrypt(encrypted, CTX)).toBe('topsecret');
  });

  it('поддерживает unicode и пустые строки', () => {
    expect(box.decrypt(box.encrypt('пароль-🔐', CTX), CTX)).toBe('пароль-🔐');
    expect(box.decrypt(box.encrypt('', CTX), CTX)).toBe('');
  });

  it('каждый раз использует новый IV', () => {
    expect(box.encrypt('x', CTX)).not.toBe(box.encrypt('x', CTX));
  });

  it('обнаруживает подмену шифртекста', () => {
    const parts = box.encrypt('topsecret', CTX).split(':');
    const flipped = Buffer.from(parts[3]!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    parts[3] = flipped.toString('base64');
    expect(() => box.decrypt(parts.join(':'), CTX)).toThrow();
  });

  it('не принимает значение из другого поля (контекст)', () => {
    expect(() => box.decrypt(box.encrypt('topsecret', CTX), 'Project.ciKeyHash')).toThrow();
  });

  it('не расшифровывается чужим ключом', () => {
    const other = new SecretBox(config({ SECRETS_KEY: randomBytes(32).toString('base64') }));
    expect(() => other.decrypt(box.encrypt('topsecret', CTX), CTX)).toThrow();
  });

  it('значение без префикса считается открытым текстом из старых записей', () => {
    expect(box.isEncrypted('plain')).toBe(false);
    expect(box.decrypt('plain', CTX)).toBe('plain');
  });

  it('падает на повреждённой записи', () => {
    expect(() => box.decrypt('v1:abc', CTX)).toThrow('Повреждённое');
  });
});

describe('SECRETS_KEY', () => {
  it('принимает base64 и hex', () => {
    const raw = randomBytes(32);
    expect(parseSecretsKey(raw.toString('base64'))).toEqual(raw);
    expect(parseSecretsKey(raw.toString('hex'))).toEqual(raw);
  });

  it.each(['', 'short', Buffer.alloc(16).toString('base64'), 'z'.repeat(64)])('отклоняет неверный ключ %j', (value) => {
    expect(() => parseSecretsKey(value)).toThrow('32 байта');
  });

  it('на проде без ключа приложение не стартует', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new SecretBox(config({}))).toThrow('SECRETS_KEY не задан');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('в разработке без ключа использует ключ для разработки', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const devBox = new SecretBox(config({}));
      expect(devBox.decrypt(devBox.encrypt('x', CTX), CTX)).toBe('x');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
