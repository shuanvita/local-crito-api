/** Тип интеграции проекта. Список будет расти. */
export type IntegrationType = 'telegram'

/** Карточка каталога интеграций: `GET /projects/:project/integrations`. */
export interface IntegrationSummary {
  type: IntegrationType
  title: string
  description: string
  /** Интеграция создана и в ней есть всё, чтобы работать (для Telegram: токен и хотя бы один чат). */
  configured: boolean
  enabled: boolean
  lastSuccessAt: string | null
  /** Последняя неудачная доставка. Стирается при следующей полностью успешной отправке; при отказе одного из чатов остаётся. */
  lastErrorAt: string | null
  lastError: string | null
}

/** Чат Telegram, куда уходят уведомления. */
export interface TelegramChat {
  /** Числовой chat_id (у групп отрицательный) или `@имя_канала`. */
  id: string
  /** Подпись для людей: в Telegram её не отправляем. */
  title: string | null
}

/** Настройки Telegram-уведомлений: `GET /projects/:project/integrations/telegram`. Токен бота наружу не отдаётся. */
export interface TelegramIntegration {
  enabled: boolean
  /** Токен бота сохранён. */
  hasToken: boolean
  /** Имя бота (без `@`), которое вернул Telegram при проверке токена. */
  botUsername: string | null
  chats: TelegramChat[]
  /** Ключи форм, о которых уведомлять; пустой список: обо всех. */
  forms: string[]
  /** Человеческие названия форм для текста уведомления (ключ формы: название). */
  formLabels: Record<string, string>
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
}

/** Сохранение настроек: `PUT /projects/:project/integrations/telegram`. Не переданное поле не меняется. */
export interface UpdateTelegramIntegrationRequest {
  enabled?: boolean
  /** Новый токен бота; пустая строка удаляет токен (и выключает интеграцию). */
  botToken?: string
  chats?: TelegramChat[]
  forms?: string[]
  formLabels?: Record<string, string>
}

export interface TelegramDeliveryResult {
  chatId: string
  ok: boolean
  error: string | null
}

/** Результат тестовой отправки: `POST /projects/:project/integrations/telegram/test`. */
export interface TelegramTestResponse {
  results: TelegramDeliveryResult[]
}

/** Чат, о котором узнал бот (его добавили или ему написали). */
export interface TelegramChatCandidate {
  id: string
  title: string
  /** `group`, `supergroup`, `channel` или `private`. */
  type: string
}

/** Поиск чатов бота: `POST /projects/:project/integrations/telegram/discover-chats`. */
export interface TelegramDiscoverResponse {
  chats: TelegramChatCandidate[]
}
