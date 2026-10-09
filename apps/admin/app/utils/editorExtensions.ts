import { Extension, Mark } from '@tiptap/core'

/**
 * Расширения TipTap, сохраняющие оформление существующего контента.
 *
 * Контент сайта содержит HTML с классами (`<span class="…">`, `<a class="…">`). Схема TipTap по умолчанию
 * такие атрибуты и обёртки отбрасывает, и первая же правка поля в админке испортила бы оформление.
 */

const classAttribute = {
  class: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('class'),
    renderHTML: (attributes: Record<string, unknown>) => (attributes.class ? { class: attributes.class } : {})
  }
}

/** Сохраняет `class` у блочных и строчных узлов, которые TipTap умеет разбирать. */
export const PreserveClass = Extension.create({
  name: 'preserveClass',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'bold', 'italic', 'underline', 'strike', 'link'],
      attributes: classAttribute
    }]
  }
})

/** `<span class="…">`: стилизованные фрагменты текста. Спаны без класса не нужны и «разворачиваются». */
export const StyledSpan = Mark.create({
  name: 'styledSpan',
  addAttributes() {
    return classAttribute
  },
  parseHTML() {
    return [{ tag: 'span[class]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  }
})
