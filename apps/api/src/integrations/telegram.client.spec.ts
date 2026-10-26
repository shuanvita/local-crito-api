import type { ConfigService } from '@nestjs/config';
import { TelegramClient, TelegramError } from './telegram.client.js';

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const client = new TelegramClient({ get: () => undefined } as unknown as ConfigService);

afterEach(() => vi.unstubAllGlobals());

const failWith = (error: Error) => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
const fetchError = (cause: unknown) => Object.assign(new TypeError(`fetch failed ${TOKEN}`), { cause });

describe('TelegramClient: сетевые ошибки', () => {
  it('сообщение содержит код причины и не содержит токена', async () => {
    failWith(fetchError(Object.assign(new Error(`connect ETIMEDOUT /bot${TOKEN}/getMe`), { code: 'ETIMEDOUT' })));
    const error = await client.getMe(TOKEN).catch((caught: TelegramError) => caught);
    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).kind).toBe('network');
    expect((error as TelegramError).message).toBe('Не удалось связаться с Telegram (ETIMEDOUT)');
    expect((error as TelegramError).message).not.toContain(TOKEN);
  });

  it('код берётся и из списка ошибок (перебор адресов IPv4/IPv6)', async () => {
    failWith(fetchError({ errors: [{ code: 'ENETUNREACH' }, { code: 'ETIMEDOUT' }] }));
    await expect(client.getMe(TOKEN)).rejects.toThrow('Не удалось связаться с Telegram (ENETUNREACH)');
  });

  it('произвольный текст вместо кода в сообщение не попадает', async () => {
    failWith(fetchError({ code: `bad code ${TOKEN}` }));
    await expect(client.getMe(TOKEN)).rejects.toThrow(/^Не удалось связаться с Telegram$/);
  });

  it('таймаут и ошибка без причины', async () => {
    failWith(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    await expect(client.getMe(TOKEN)).rejects.toThrow('Telegram не ответил вовремя');
    failWith(new TypeError('fetch failed'));
    await expect(client.getMe(TOKEN)).rejects.toThrow(/^Не удалось связаться с Telegram$/);
  });
});
