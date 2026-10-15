/**
 * Сообщения предпросмотра между админкой и сайтом (`window.postMessage`).
 *
 * Сохранение = публикация, черновиков в CMS нет, поэтому несохранённые правки админка показывает
 * через iframe с сайтом: открывает страницу с параметром `?crito-preview=1` и присылает ей состояние
 * редактора. Сайт принимает сообщения только внутри iframe, от родительского окна.
 */
import type { ContentPage } from './content.js'

/** Значение поля `source` у всех сообщений предпросмотра. */
export type PreviewChannel = 'crito-preview'

/** Страница для предпросмотра: то, что сайт читает из публичного API, без `slug` и `version`. */
export type PreviewDraftPage = Omit<ContentPage, 'slug' | 'version'>

/** Админка -> сайт: текущее состояние редактора (блоки, SEO, настройки шапки и футера). */
export interface PreviewDraftMessage {
  source: PreviewChannel
  type: 'draft'
  page: PreviewDraftPage
}

/** Админка -> сайт: какой блок выбран в редакторе (null: выбраны настройки страницы). */
export interface PreviewSelectMessage {
  source: PreviewChannel
  type: 'select'
  blockId: string | null
}

/** Сайт -> админка: страница загружена и готова принять черновик. */
export interface PreviewReadyMessage {
  source: PreviewChannel
  type: 'ready'
}

/** Сайт -> админка: посетитель-редактор кликнул по блоку в предпросмотре, редактор должен выбрать его. */
export interface PreviewPickMessage {
  source: PreviewChannel
  type: 'pick'
  blockId: string
}

export type PreviewMessageToSite = PreviewDraftMessage | PreviewSelectMessage
export type PreviewMessageToAdmin = PreviewReadyMessage | PreviewPickMessage
