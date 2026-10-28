<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Вход' })

const route = useRoute()
const config = useRuntimeConfig()
const base = config.app.baseURL.replace(/\/+$/, '')
// Админка может жить под префиксом (/admin): картинки из public лежат под ним же.
const logoSrc = `${base}/logo.png`
const logoWhiteSrc = `${base}/logo-white.png`

const state = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
// Подсветка полей только после попытки входа, а не пока человек ещё печатает.
const invalid = reactive({ email: false, password: false })

const emailInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('emailInput')
const passwordInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('passwordInput')

// Возвращаем туда, откуда выкинуло на вход; принимаем только внутренний путь.
const redirect = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
})

async function onSubmit() {
  error.value = ''
  invalid.email = !state.email.trim()
  invalid.password = !state.password
  if (invalid.email || invalid.password) {
    // Одно сообщение на всю форму: пустая форма не должна краснеть ошибкой у каждого поля.
    error.value = invalid.email && invalid.password
      ? 'Укажите почту и пароль.'
      : invalid.email ? 'Укажите почту.' : 'Укажите пароль.'
    ;(invalid.email ? emailInput : passwordInput).value?.inputRef?.focus()
    return
  }

  loading.value = true
  try {
    await $fetch(`${base}/auth/login`, { method: 'POST', body: { email: state.email.trim(), password: state.password } })
    // Полная перезагрузка: кэш данных предыдущего пользователя не должен пережить вход.
    window.location.assign(`${base}${redirect.value}`)
  } catch (e) {
    const status = (e as { statusCode?: number, status?: number }).statusCode ?? (e as { status?: number }).status
    error.value = status === 429
      ? 'Слишком много попыток. Подождите несколько минут.'
      : status === 401
        ? 'Неверная почта или пароль.'
        : apiErrorMessage(e)
    state.password = ''
    // Пароль введён заново, а почта скорее всего верна.
    await nextTick()
    passwordInput.value?.inputRef?.focus()
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
    <!-- Тёмный текст логотипа нечитаем на тёмной теме: в ней показываем белый вариант. -->
    <img :src="logoSrc" alt="ЦРИТО" class="h-12 w-auto dark:hidden">
    <img :src="logoWhiteSrc" alt="ЦРИТО" class="hidden h-12 w-auto dark:block">

    <UCard class="w-full max-w-sm">
      <div class="mb-6">
        <h1 class="text-2xl font-semibold text-highlighted">
          Вход в Crito CMS
        </h1>
        <p class="mt-1 text-sm text-muted">
          Почта и пароль, которые выдал администратор. Забыли пароль? Обратитесь к администратору.
        </p>
      </div>

      <UForm :state="state" class="space-y-4" novalidate @submit="onSubmit">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :description="error"
          role="alert"
        />
        <UFormField label="Почта" name="email">
          <UInput
            ref="emailInput"
            v-model="state.email"
            type="email"
            autocomplete="username"
            :color="invalid.email ? 'error' : 'neutral'"
            :highlight="invalid.email"
            class="w-full"
            autofocus
            @update:model-value="invalid.email = false"
          />
        </UFormField>
        <UFormField label="Пароль" name="password">
          <UInput
            ref="passwordInput"
            v-model="state.password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :color="invalid.password ? 'error' : 'neutral'"
            :highlight="invalid.password"
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
            @update:model-value="invalid.password = false"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                class="cursor-pointer"
                :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="showPassword ? 'Скрыть пароль' : 'Показать пароль'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              />
            </template>
          </UInput>
        </UFormField>
        <!-- Явный отклик: у кнопки по умолчанию hover еле заметен, а курсор остаётся стрелкой. -->
        <UButton
          type="submit"
          label="Войти"
          size="lg"
          block
          :loading="loading"
          class="cursor-pointer transition-colors hover:bg-primary-600 active:bg-primary-700"
        />
      </UForm>
    </UCard>
  </div>
</template>
