import type { CreatePageRequest } from './pages.js'

/** Файл экспорта контента сайта (`scripts/rucode/export.mjs`) для импорта в CMS. */
export interface ExportFile {
  project: string
  pages: CreatePageRequest[]
}
