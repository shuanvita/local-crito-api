/** Выход: закрывает сессию в API (если она есть) и стирает cookie. Всегда отвечает 204: выйти можно и с протухшей сессией. */
export default defineEventHandler(async (event) => {
  const { apiUrl, app } = useRuntimeConfig(event)
  if (!isSameOrigin(event.method, getRequestHeader(event, 'origin'), getRequestHost(event, { xForwardedHost: true }))) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Запрос с чужого адреса' })
  }

  const token = getCookie(event, SESSION_COOKIE)
  if (token) {
    // Сбой API не должен оставлять пользователя «вошедшим»: cookie стираем в любом случае.
    await $fetch(`${apiBase(apiUrl)}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    }).catch(() => undefined)
  }
  deleteCookie(event, SESSION_COOKIE, { path: cookiePath(app.baseURL) })
  setResponseStatus(event, 204)
  return null
})
