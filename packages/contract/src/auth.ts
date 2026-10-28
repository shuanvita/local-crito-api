/**
 * Право на проект: на весь проект или на отдельные страницы.
 * Редактирование включает публикацию; ролей нет. Выдаётся локально (до LMS) или приходит из LMS.
 */
export type Grant =
  | { project: string, scope: 'project' }
  | { project: string, scope: 'pages', pageIds: string[] }

/** `POST /auth/login`. */
export interface LoginRequest {
  email: string
  password: string
}

/** Ответ входа: токен нужен только серверному прокси админки, который кладёт его в httpOnly-cookie. */
export interface LoginResponse {
  token: string
  /** Когда сессия истечёт безусловно (ISO 8601). */
  expiresAt: string
}

/** `POST /auth/password`: смена своего пароля. Остальные сессии пользователя обрываются. */
export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

/** Пользователь в списке «Доступы». Пароль и его хэш наружу не отдаются. */
export interface UserAccount {
  id: string
  email: string
  name: string | null
  isSuperAdmin: boolean
  active: boolean
  /** Есть ли у пользователя пароль (у связанных с LMS его не будет). */
  hasPassword: boolean
  grants: Grant[]
  createdAt: string
}

/** Права пользователя одним списком; пустой список снимает все права. */
export interface UserGrants {
  grants: Grant[]
}

export interface CreateUserRequest {
  email: string
  name?: string
  password: string
  isSuperAdmin?: boolean
}

export interface UpdateUserRequest {
  name?: string
  isSuperAdmin?: boolean
  active?: boolean
}

export interface ResetPasswordRequest {
  password: string
}
