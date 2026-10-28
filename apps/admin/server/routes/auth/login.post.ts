import type { LoginResponse } from '@crito/contract'

/**
 * Вход: передаёт почту и пароль API и кладёт полученный токен сессии в httpOnly-cookie.
 * Токен в браузерный JS не попадает. IP клиента отдаём API для лимита попыток (API слушает только локальный интерфейс).
 */
export default defineEventHandler(async (event) => {
  const { apiUrl, app } = useRuntimeConfig(event)
  if (!isSameOrigin(event.method, getRequestHeader(event, 'origin'), getRequestHost(event, { xForwardedHost: true }))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Запрос с чужого адреса' })
  }

  const body = await readBody<{ email?: unknown, password?: unknown }>(event)
  try {
    const result = await $fetch<LoginResponse>(`${apiBase(apiUrl)}/auth/login`, {
      method: 'POST',
      body: { email: body?.email, password: body?.password },
      headers: { 'x-crito-client-ip': getRequestIP(event, { xForwardedFor: true }) ?? '' }
    })
    setCookie(event, SESSION_COOKIE, result.token, {
      httpOnly: true,
      // На localhost в разработке по http Secure-cookie не сохранится.
      secure: !import.meta.dev,
      sameSite: 'lax',
      path: cookiePath(app.baseURL),
      maxAge: SESSION_COOKIE_MAX_AGE
    })
    return { ok: true }
  } catch (error) {
    const response = (error as { response?: { status?: number, _data?: { message?: string } } }).response
    throw createError({
      statusCode: response?.status ?? 502,
      message: response?._data?.message ?? 'Не удалось выполнить вход'
    })
  }
})
