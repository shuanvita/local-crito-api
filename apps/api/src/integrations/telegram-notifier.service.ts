import type { TelegramChat, TelegramDeliveryResult } from '@crito/contract';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service.js';
import { SecretBox, TELEGRAM_SECRET_CONTEXT } from '../common/secret-box.js';
import { readTelegramConfig } from './telegram-config.js';
import { buildSubmissionMessage } from './telegram-message.js';
import type { SubmissionEvent } from './telegram-message.js';
import { TelegramClient, TelegramError } from './telegram.client.js';

/** Дольше Telegram просить подождать не будем: уведомление всё равно теряет смысл. */
const MAX_RETRY_AFTER_SECONDS = 10;
const MAX_ERROR_LENGTH = 500;

export interface SubmissionNotification extends SubmissionEvent {
  projectId: string;
}

/**
 * Уведомления о заявках в Telegram.
 *
 * Работает в фоне, как вебхук сайта: приём заявки не ждёт Telegram, а его сбой не ломает приём
 * (заявка к этому моменту уже сохранена и видна в админке). Очереди нет: при перезапуске сервера
 * во время отправки уведомление теряется.
 */
@Injectable()
export class TelegramNotifierService implements OnApplicationShutdown {
  private readonly logger = new Logger(TelegramNotifierService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly client: TelegramClient,
    private readonly config: ConfigService,
  ) {}

  /** Ставит уведомление в фон и сразу возвращает управление. Настройки читаются тоже в фоне. */
  notify(event: SubmissionNotification): void {
    const task: Promise<void> = this.run(event).finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /** Дожидается незавершённых отправок: нужно при остановке сервера и в тестах. */
  async flush(): Promise<void> {
    await Promise.allSettled(this.pending);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  /**
   * Отправляет текст во все чаты и записывает итог в интеграцию (для карточки в админке).
   * Ошибки отдельных чатов не бросаются, а возвращаются: тестовая отправка показывает их менеджеру.
   */
  async deliver(
    integrationId: string,
    token: string,
    chats: TelegramChat[],
    html: string,
  ): Promise<TelegramDeliveryResult[]> {
    const results = await Promise.all(chats.map((chat) => this.sendWithRetry(token, chat.id, html)));
    try {
      await this.recordOutcome(integrationId, results);
    } catch (error) {
      // Интеграцию могли удалить, пока шла отправка.
      this.logger.warn(`Не удалось записать итог отправки: ${(error as Error).message}`);
    }
    return results;
  }

  private async run(event: SubmissionNotification): Promise<void> {
    try {
      const row = await this.prisma.projectIntegration.findUnique({
        where: { projectId_type: { projectId: event.projectId, type: 'telegram' } },
      });
      if (!row?.enabled || !row.secret) return;
      const config = readTelegramConfig(row.config);
      if (config.chats.length === 0) return;
      if (config.forms.length > 0 && !config.forms.includes(event.formKey)) return;

      const token = this.secrets.decrypt(row.secret, TELEGRAM_SECRET_CONTEXT);
      const html = buildSubmissionMessage(event, {
        adminBaseUrl: this.config.get<string>('PUBLIC_BASE_URL')?.trim() || null,
      });
      await this.deliver(row.id, token, config.chats, html);
    } catch (error) {
      this.logger.warn(`Уведомление Telegram для ${event.projectSlug} не отправлено: ${(error as Error).message}`);
    }
  }

  private async sendWithRetry(token: string, chatId: string, html: string): Promise<TelegramDeliveryResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.client.sendMessage(token, chatId, html);
        return { chatId, ok: true, error: null };
      } catch (error) {
        const tooMany = error instanceof TelegramError && error.status === 429;
        const wait = tooMany ? (error as TelegramError).retryAfter : undefined;
        if (attempt === 0 && wait !== undefined && wait <= MAX_RETRY_AFTER_SECONDS) {
          await new Promise((resolve) => setTimeout(resolve, wait * 1000));
          continue;
        }
        const message = error instanceof TelegramError ? error.message : 'Внутренняя ошибка при отправке';
        return { chatId, ok: false, error: message };
      }
    }
  }

  private async recordOutcome(integrationId: string, results: TelegramDeliveryResult[]): Promise<void> {
    const now = new Date();
    const failed = results.filter((result) => !result.ok);
    if (failed.length === 0) {
      await this.prisma.projectIntegration.update({
        where: { id: integrationId },
        data: { lastSuccessAt: now, lastErrorAt: null, lastError: null },
      });
      return;
    }
    const more = failed.length > 1 ? ` (и ещё чатов с ошибкой: ${failed.length - 1})` : '';
    await this.prisma.projectIntegration.update({
      where: { id: integrationId },
      data: {
        lastErrorAt: now,
        lastError: `Чат ${failed[0].chatId}: ${failed[0].error}${more}`.slice(0, MAX_ERROR_LENGTH),
        ...(failed.length < results.length ? { lastSuccessAt: now } : {}),
      },
    });
  }
}
