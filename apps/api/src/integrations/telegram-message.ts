import type { SubmissionFieldValue } from '@crito/contract';

/** Предел длины текста сообщения в Bot API. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_VALUE_LENGTH = 500;

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

/** Обрезает по символам, а не по кодовым единицам: эмодзи на границе не разрезается пополам (Telegram отклонит такой текст). */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${Array.from(value.slice(0, max)).slice(0, -1).join('')}…`;
}

/**
 * Название формы из настроек. Ключ формы приходит от посетителя сайта (`constructor`, `__proto__`),
 * поэтому берём только собственные свойства: унаследованные не строки и сломали бы `.trim()`.
 */
function formLabel(formLabels: Record<string, string> | undefined, formKey: string): string {
  const label = formLabels && Object.hasOwn(formLabels, formKey) ? formLabels[formKey] : undefined;
  return (typeof label === 'string' && label.trim()) || formKey;
}

/**
 * Текст уведомления. Значения полей приходят от посетителей сайта, поэтому каждое экранируется,
 * а длина считается по готовому HTML: обрезаем по целым строкам, чтобы не разрезать тег или `&amp;`.
 */
export function buildSubmissionMessage(
  event: SubmissionEvent,
  options: { formLabels?: Record<string, string>; adminBaseUrl?: string | null } = {},
): string {
  const label = formLabel(options.formLabels, event.formKey);
  const head = `<b>Новая заявка</b>: ${escapeHtml(truncate(label, 100))}\nПроект: ${escapeHtml(truncate(event.projectName, 100))}`;

  const footer: string[] = [];
  if (event.pageUrl) footer.push(`Страница: ${escapeHtml(truncate(event.pageUrl, MAX_VALUE_LENGTH))}`);
  if (options.adminBaseUrl) {
    const url = `${options.adminBaseUrl.replace(/\/+$/, '')}/${event.projectSlug}/requests?id=${event.submissionId}`;
    footer.push(`<a href="${escapeAttribute(url)}">Открыть в админке</a>`);
  }
  const tail = footer.length ? `\n\n${footer.join('\n')}` : '';

  const lines = Object.entries(event.fields).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(', ') : value;
    return `<b>${escapeHtml(key)}:</b> ${escapeHtml(truncate(text, MAX_VALUE_LENGTH))}`;
  });

  let body = '';
  let shown = 0;
  for (const line of lines) {
    // Запас на строку «и ещё N полей».
    const next = `${body}\n${line}`;
    if (head.length + 2 + next.length + tail.length + 40 > TELEGRAM_MESSAGE_LIMIT) break;
    body = next;
    shown += 1;
  }
  const hidden = lines.length - shown;
  const more = hidden > 0 ? `\n… и ещё полей: ${hidden}` : '';
  return `${head}\n${body}${more}${tail}`;
}
