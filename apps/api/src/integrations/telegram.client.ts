import type { TelegramChatCandidate } from '@crito/contract';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Ошибка Telegram или сети. Текст формируем сами и никогда не берём из исключения `fetch`:
 * токен бота входит в адрес запроса, и его нельзя пускать ни в логи, ни в ответы API.
 */
export class TelegramError extends Error {
  constructor(
    message: string,
    /** `api`: Telegram ответил отказом; `network`: ответа не было (недоступен, таймаут). */
    readonly kind: 'api' | 'network',
    /** HTTP-код ответа Telegram (для `api`). */
    readonly status?: number,
    /** Через сколько секунд Telegram просит повторить запрос (при 429). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
}

interface TelegramChatInfo {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdate {
  message?: { chat: TelegramChatInfo };
  edited_message?: { chat: TelegramChatInfo };
  channel_post?: { chat: TelegramChatInfo };
  my_chat_member?: { chat: TelegramChatInfo };
}

/** Тонкая обёртка над Bot API: только то, что нужно интеграции. */
@Injectable()
export class TelegramClient {
  constructor(private readonly config: ConfigService) {}

  /** Проверяет токен и возвращает имя бота. */
  async getMe(token: string): Promise<{ username: string | null }> {
    const me = await this.call<{ username?: string }>(token, 'getMe');
    return { username: me.username ?? null };
  }

  async sendMessage(token: string, chatId: string, html: string): Promise<void> {
    await this.call(token, 'sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      // Превью ссылки из текста заявки только загромождает сообщение.
      link_preview_options: { is_disabled: true },
    });
  }

  /** Чаты, которые встретились в необработанных обновлениях бота (без смещения: сами обновления не «съедаем»). */
  async discoverChats(token: string): Promise<TelegramChatCandidate[]> {
    const updates = await this.call<TelegramUpdate[]>(token, 'getUpdates', {
      timeout: 0,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'my_chat_member'],
    });
    const chats = new Map<string, TelegramChatCandidate>();
    for (const update of updates) {
      const chat = (update.message ?? update.edited_message ?? update.channel_post ?? update.my_chat_member)?.chat;
      if (!chat) continue;
      chats.set(String(chat.id), { id: String(chat.id), title: chatTitle(chat), type: chat.type });
    }
    return [...chats.values()];
  }

  private async call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
    const base = (this.config.get<string>('TELEGRAM_API_BASE')?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
    let response: Response;
    try {
      response = await fetch(`${base}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timeout = (error as Error).name === 'TimeoutError';
      throw new TelegramError(timeout ? 'Telegram не ответил вовремя' : 'Не удалось связаться с Telegram', 'network');
    }

    let payload: TelegramResponse<T> | undefined;
    try {
      payload = (await response.json()) as TelegramResponse<T>;
    } catch {
      payload = undefined;
    }
    if (!response.ok || !payload?.ok) {
      throw new TelegramError(
        payload?.description ? `Telegram: ${payload.description}` : `Telegram ответил ${response.status}`,
        'api',
        response.status,
        payload?.parameters?.retry_after,
      );
    }
    return payload.result as T;
  }
}

function chatTitle(chat: TelegramChatInfo): string {
  if (chat.title) return chat.title;
  const person = [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  return person || (chat.username ? `@${chat.username}` : String(chat.id));
}
