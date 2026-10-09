/** Файл медиатеки: `POST|GET /projects/:project/media`. */
export interface MediaItem {
  id: string
  /** Ключ в хранилище: `<project>/<sha256>.<ext>`. */
  key: string
  /** Публичный адрес файла: его и сохраняют в данных блоков. */
  url: string
  sha256: string
  mime: string
  size: number
  width: number | null
  height: number | null
  originalName: string
  createdAt: string
}
