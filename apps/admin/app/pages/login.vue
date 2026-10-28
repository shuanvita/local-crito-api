<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: false })
useHead({ title: 'Вход' })

const route = useRoute()
const config = useRuntimeConfig()
const base = config.app.baseURL.replace(/\/+$/, '')

const schema = z.object({
  email: z.string().trim().min(1, 'Укажите почту').email('Некорректная почта'),
  password: z.string().min(1, 'Укажите пароль')
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ email: '', password: '' })
const loading = ref(false)
const error = ref('')

// Возвращаем туда, откуда выкинуло на вход; принимаем только внутренний путь.
const redirect = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch(`${base}/auth/login`, { method: 'POST', body: event.data })
    // Полная перезагрузка: кэш данных предыдущего пользователя не должен пережить вход.
    window.location.assign(`${base}${redirect.value === '/' ? '/' : redirect.value}`)
  } catch (e) {
    const status = (e as { statusCode?: number, status?: number }).statusCode ?? (e as { status?: number }).status
    error.value = status === 429
      ? 'Слишком много попыток. Подождите несколько минут.'
      : status === 401
        ? 'Неверная почта или пароль.'
        : apiErrorMessage(e)
    state.password = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">
          Вход в Crito CMS
        </h1>
      </template>

      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="error" />
        <UFormField label="Почта" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="username" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Пароль" name="password" required>
          <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Войти" block :loading="loading" />
      </UForm>
    </UCard>
  </div>
</template>
