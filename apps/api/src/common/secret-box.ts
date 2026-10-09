import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDevelopment } from '../config/runtime.js';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Ключ из SECRETS_KEY: 32 байта в base64 или 64 hex-символа. */
export function parseSecretsKey(value: string): Buffer {
  const trimmed = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      'SECRETS_KEY должен содержать 32 байта (base64 или 64 hex-символа). ' +
        "Сгенерировать: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return key;
}

/**
 * Шифрование секретов, которые лежат в БД (например, секрет вебхука сайта).
 * AES-256-GCM: шифртекст нельзя незаметно подменить, а `context` привязывает значение к полю,
 * так что секрет из одного столбца нельзя подставить в другой.
 *
 * Формат: `v1:<iv>:<tag>:<шифртекст>` (base64). Значения без префикса `v1:` считаются открытым текстом
 * из старых записей: читаются как есть и шифруются при следующем сохранении.
 */
@Injectable()
export class SecretBox {
  private readonly logger = new Logger(SecretBox.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configured = config.get<string>('SECRETS_KEY');
    if (configured) {
      this.key = parseSecretsKey(configured);
    } else if (!isDevelopment()) {
      throw new Error('SECRETS_KEY не задан');
    } else {
      this.logger.warn('SECRETS_KEY не задан: используется ключ для разработки, на проде так нельзя');
      this.key = createHash('sha256').update('crito-dev-secrets-key').digest();
    }
  }

  encrypt(plain: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(stored: string, context: string): string {
    if (!this.isEncrypted(stored)) return stored;
    const parts = stored.split(':');
    const [, iv, tag, encrypted] = parts;
    // Зашифрованная пустая строка даёт пустой последний сегмент: это допустимо.
    if (parts.length !== 4 || !iv || !tag || encrypted === undefined) {
      throw new Error('Повреждённое зашифрованное значение');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(`${VERSION}:`);
  }
}

/** Контекст шифрования секрета вебхука проекта. */
export const REVALIDATE_SECRET_CONTEXT = 'Project.revalidateSecret';
