/** Значение поля формы: строка или список строк (множественный выбор). */
export type SubmissionFieldValue = string | string[]

/** Заявка с формы сайта, строка списка: `GET /projects/:project/requests`. */
export interface FormSubmissionItem {
  id: string
  /** Ключ формы, который задал сайт (например `consortium`). */
  form: string
  name: string | null
  email: string | null
  phone: string | null
  /** Страница сайта, с которой отправлена форма. */
  pageUrl: string | null
  createdAt: string
}

/** Просмотр заявки: `GET /projects/:project/requests/:id`. */
export interface FormSubmissionDetail extends FormSubmissionItem {
  /** Все поля формы в порядке отправки. */
  fields: Record<string, SubmissionFieldValue>
}

/** Страница списка заявок с фильтрами и курсором. */
export interface FormSubmissionList {
  items: FormSubmissionItem[]
  /** Всего заявок по текущим фильтрам. */
  total: number
  /** Курсор следующей страницы (`?cursor=`) или `null`, если это конец списка. */
  nextCursor: string | null
  /** Ключи форм проекта: для фильтра. */
  forms: string[]
}

/** Приём заявки сайтом: `POST /public/:project/requests`. */
export interface SubmitFormRequest {
  form: string
  fields: Record<string, SubmissionFieldValue>
  pageUrl?: string
  /** Поле-ловушка для ботов: у людей оно пустое и скрыто. */
  website?: string
}

export interface SubmitFormResponse {
  accepted: true
}
