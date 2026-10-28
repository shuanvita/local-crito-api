/** `GET /me`: кто вошёл. Интерфейс по нему показывает действия, доступные только администратору админки. */
export interface CurrentUser {
  id: string
  email: string
  name: string | null
  /** Администратор админки: правит общие справочники, создаёт проекты, выдаёт доступы. */
  isSuperAdmin: boolean
  /** Вошёл через LMS: пароль и выход в CMS не нужны, ими управляет LMS. */
  viaLms: boolean
}
