import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/** Отдельный экземпляр DOMPurify: хуки и настройки одного потребителя (SVG, rich-text) не влияют на другого. */
export function createPurify() {
  return createDOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
}
