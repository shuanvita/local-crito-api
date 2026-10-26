import type { TelegramChat } from '@crito/contract';

/** Открытые настройки Telegram-интеграции: лежат в `ProjectIntegration.config` (токена здесь нет). */
export interface TelegramConfig {
  chats: TelegramChat[];
  /** Пустой список: уведомлять обо всех формах. */
  forms: string[];
  formLabels: Record<string, string>;
  botUsername: string | null;
}

export const EMPTY_TELEGRAM_CONFIG: TelegramConfig = { chats: [], forms: [], formLabels: {}, botUsername: null };

/** Читает `config` из БД; всё неожиданное отбрасывается, запись без полей даёт пустые настройки. */
export function readTelegramConfig(raw: unknown): TelegramConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_TELEGRAM_CONFIG };
  const value = raw as Record<string, unknown>;

  const chats = Array.isArray(value.chats)
    ? value.chats.flatMap((chat): TelegramChat[] => {
        const item = chat as { id?: unknown; title?: unknown } | null;
        return typeof item?.id === 'string' ? [{ id: item.id, title: typeof item.title === 'string' ? item.title : null }] : [];
      })
    : [];
  const forms = Array.isArray(value.forms) ? value.forms.filter((form): form is string => typeof form === 'string') : [];
  // `fromEntries`, а не присваивание: ключ `__proto__` (его выбирает посетитель сайта) должен стать обычным свойством.
  const formLabels: Record<string, string> =
    value.formLabels && typeof value.formLabels === 'object' && !Array.isArray(value.formLabels)
      ? Object.fromEntries(Object.entries(value.formLabels).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
  return { chats, forms, formLabels, botUsername: typeof value.botUsername === 'string' ? value.botUsername : null };
}
