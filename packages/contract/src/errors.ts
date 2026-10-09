/** Тело ошибки API (формат Nest). */
export interface ApiErrorBody {
  statusCode: number
  message: string
  error?: string
  /** Подробности проверки: пути и причины (400 при невалидных блоках, адресах). */
  errors?: string[]
  /** Страницы, где используется файл (409 при удалении из медиатеки). */
  pages?: string[]
}
