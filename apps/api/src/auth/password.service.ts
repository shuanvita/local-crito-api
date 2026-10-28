import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Параметры scrypt лежат в самой строке хэша: позже их можно усилить, старые пароли продолжат проверяться. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
/** Явный предел памяти: по умолчанию Node даёт 32 МБ, на N=16384, r=8 нужно около 16 МБ, берём с запасом. */
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 10;
/** Верхний предел защищает от дорогих запросов с огромным «паролем». */
export const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, length, { N: n, r, p, maxmem: MAX_MEM }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

@Injectable()
export class PasswordService {
  /** Строка вида `scrypt$N$r$p$соль$хэш` (base64). */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, N, R, P, KEY_LENGTH);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  /** Сравнение за постоянное время; испорченная строка хэша даёт `false`, а не исключение. */
  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (![n, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (expected.length === 0) return false;
    try {
      const actual = await derive(password, salt, n, r, p, expected.length);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
