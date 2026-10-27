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
  /**
   * Вопросы формы по ключам полей (так, как их видел заявитель). Без подписи, например у заявок,
   * присланных до появления подписей, ключа в объекте нет: тогда админка показывает сам ключ.
   */
  labels: Record<string, string>
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
  /** Необязательные подписи полей: ключ поля -> вопрос формы. Подписи к несуществующим полям отбрасываются. */
  labels?: Record<string, string>
  pageUrl?: string
  /** Поле-ловушка для ботов: у людей оно пустое и скрыто. */
  website?: string
}

export interface SubmitFormResponse {
  accepted: true
}
