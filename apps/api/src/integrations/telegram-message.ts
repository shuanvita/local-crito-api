import type { SubmissionFieldValue } from '@crito/contract';

export interface SubmissionEvent {
  projectSlug: string;
  projectName: string;
  submissionId: string;
  formKey: string;
  pageUrl: string | null;
  fields: Record<string, SubmissionFieldValue>;
}

/** Экранирование для `parse_mode: HTML`: только эти три символа, а в атрибуте ещё кавычка. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const escapeAttribute = (value: string) => escapeHtml(value).replace(/"/g, '&quot;');

const MAX_URL_LENGTH = 500;

/**
 * Текст уведомления: заголовок, страница сайта и ссылка на заявку в админке. Содержимое заявки в чат не уходит
 * (персональные данные остаются в CMS), поэтому длина сообщения заведомо мала. Адрес страницы приходит
 * от посетителя сайта: экранируется и обрезается.
 */
export function buildSubmissionMessage(event: SubmissionEvent, options: { adminBaseUrl?: string | null } = {}): string {
  const lines = ['<b>Поступила новая заявка с сайта</b>'];
  if (event.pageUrl) lines.push('', `Страница: ${escapeHtml(event.pageUrl.slice(0, MAX_URL_LENGTH))}`);
  if (options.adminBaseUrl) {
    const url = `${options.adminBaseUrl.replace(/\/+$/, '')}/${event.projectSlug}/requests?id=${event.submissionId}`;
    lines.push('', `<a href="${escapeAttribute(url)}">Открыть заявку в админке</a>`);
  }
  return lines.join('\n');
}
