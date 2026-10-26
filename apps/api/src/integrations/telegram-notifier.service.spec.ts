import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../common/prisma.service.js';
import { SecretBox, TELEGRAM_SECRET_CONTEXT } from '../common/secret-box.js';
import { TelegramNotifierService } from './telegram-notifier.service.js';
import type { SubmissionNotification } from './telegram-notifier.service.js';
import { TelegramError } from './telegram.client.js';
import type { TelegramClient } from './telegram.client.js';

const box = new SecretBox({ get: () => randomBytes(32).toString('base64') } as unknown as ConfigService);
const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const notification: SubmissionNotification = {
  projectId: 'p1',
  projectSlug: 'rucode',
  projectName: 'Rucode',
  submissionId: 's1',
  formKey: 'participation',
  pageUrl: null,
  fields: { name: 'Иван' },
};

function setup(row: Record<string, unknown> | null, sendMessage = vi.fn().mockResolvedValue(undefined)) {
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    projectIntegration: { findUnique: vi.fn().mockResolvedValue(row), update },
  } as unknown as PrismaService;
  const config = { get: (key: string) => (key === 'PUBLIC_BASE_URL' ? 'https://cms.example.ru' : undefined) };
  const service = new TelegramNotifierService(
    prisma,
    box,
    { sendMessage } as unknown as TelegramClient,
    config as unknown as ConfigService,
  );
  return { service, sendMessage, update };
}

const integration = (config: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 'i1',
  enabled: true,
  secret: box.encrypt(TOKEN, TELEGRAM_SECRET_CONTEXT),
  config: { chats: [{ id: '-100', title: null }, { id: '200', title: null }], forms: [], formLabels: {}, ...config },
  ...extra,
});

describe('TelegramNotifierService', () => {
  it('отправляет во все чаты расшифрованным токеном и записывает успех', async () => {
    const { service, sendMessage, update } = setup(integration());
    service.notify(notification);
    await service.flush();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [TOKEN, '-100'],
      [TOKEN, '200'],
    ]);
    expect(sendMessage.mock.calls[0][2]).toContain('Иван');
    expect(update.mock.calls[0][0].data).toMatchObject({ lastErrorAt: null, lastError: null });
    expect(update.mock.calls[0][0].data.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('notify не ждёт отправку', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const { service, sendMessage } = setup(integration(), vi.fn().mockReturnValue(hold));
    const result = service.notify(notification);
    expect(result).toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
    release();
    await service.flush();
    expect(sendMessage).toHaveBeenCalled();
  });

  it.each([
    ['нет интеграции', null],
    ['интеграция выключена', integration({}, { enabled: false })],
    ['нет токена', integration({}, { secret: null })],
    ['нет чатов', integration({ chats: [] })],
    ['форма не в фильтре', integration({ forms: ['consortium'] })],
  ])('ничего не отправляет: %s', async (_name, row) => {
    const { service, sendMessage, update } = setup(row);
    service.notify(notification);
    await service.flush();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('форма из фильтра отправляется', async () => {
    const { service, sendMessage } = setup(integration({ forms: ['participation'] }));
    service.notify(notification);
    await service.flush();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('ошибка одного чата не мешает другим и записывается без токена', async () => {
    const sendMessage = vi.fn(async (_token: string, chatId: string) => {
      if (chatId === '-100') throw new TelegramError('Telegram: Forbidden: bot was kicked', 'api', 403);
    });
    const { service, update } = setup(integration(), sendMessage);
    service.notify(notification);
    await service.flush();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const data = update.mock.calls[0][0].data;
    expect(data.lastError).toBe('Чат -100: Telegram: Forbidden: bot was kicked');
    expect(data.lastError).not.toContain(TOKEN);
    expect(data.lastErrorAt).toBeInstanceOf(Date);
    expect(data.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('при 429 повторяет один раз после паузы', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new TelegramError('Telegram: Too Many Requests', 'api', 429, 0))
      .mockResolvedValue(undefined);
    const { service } = setup(integration({ chats: [{ id: '1', title: null }] }), sendMessage);
    const results = await service.deliver('i1', TOKEN, [{ id: '1', title: null }], 'x');
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(results).toEqual([{ chatId: '1', ok: true, error: null }]);
  });

  it('второй 429 подряд и слишком долгая пауза не повторяются', async () => {
    const always = vi.fn().mockRejectedValue(new TelegramError('Telegram: Too Many Requests', 'api', 429, 0));
    const first = setup(null, always);
    const results = await first.service.deliver('i1', TOKEN, [{ id: '1', title: null }], 'x');
    expect(always).toHaveBeenCalledTimes(2);
    expect(results[0].ok).toBe(false);

    const slow = vi.fn().mockRejectedValue(new TelegramError('Telegram: Too Many Requests', 'api', 429, 3600));
    const second = setup(null, slow);
    await second.service.deliver('i1', TOKEN, [{ id: '1', title: null }], 'x');
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('неожиданная ошибка не раскрывает подробности и не бросается наружу', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error(`boom ${TOKEN}`));
    const { service } = setup(integration({ chats: [{ id: '1', title: null }] }), sendMessage);
    const results = await service.deliver('i1', TOKEN, [{ id: '1', title: null }], 'x');
    expect(results).toEqual([{ chatId: '1', ok: false, error: 'Внутренняя ошибка при отправке' }]);
  });

  it('повреждённый секрет и сбой БД не приводят к исключению и не светят токен в логе', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const broken = setup(integration({}, { secret: 'v1:broken' }));
    broken.service.notify(notification);
    await expect(broken.service.flush()).resolves.toBeUndefined();
    expect(broken.sendMessage).not.toHaveBeenCalled();

    const prisma = { projectIntegration: { findUnique: vi.fn().mockRejectedValue(new Error('db down')) } };
    const service = new TelegramNotifierService(
      prisma as unknown as PrismaService,
      box,
      {} as TelegramClient,
      { get: () => undefined } as unknown as ConfigService,
    );
    service.notify(notification);
    await expect(service.flush()).resolves.toBeUndefined();
    expect(warn.mock.calls.flat().join(' ')).not.toContain(TOKEN);
    warn.mockRestore();
  });
});
