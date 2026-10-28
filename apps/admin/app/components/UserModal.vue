<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CreateUserRequest } from '@crito/contract'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const toast = useToast()

const schema = z.object({
  email: z.string().trim().min(1, 'Укажите почту').email('Некорректная почта'),
  name: z.string().trim().max(200, 'Не длиннее 200 символов').optional(),
  password: z.string().min(10, 'Не короче 10 символов').max(200, 'Не длиннее 200 символов'),
  isSuperAdmin: z.boolean()
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const loading = ref(false)

watch(open, (value) => {
  if (!value) return
  state.email = ''
  state.name = ''
  state.password = ''
  state.isSuperAdmin = false
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const body: CreateUserRequest = { ...event.data, name: event.data.name || undefined }
    await api('/users', { method: 'POST', body })
    open.value = false
    emit('saved')
  } catch (error) {
    toast.add({ title: 'Не удалось создать пользователя', description: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Новый пользователь"
    description="Права на проекты выдаются после создания."
  >
    <template #body>
      <UForm id="user-form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Почта" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="off" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Имя" name="name">
          <UInput v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField label="Пароль" name="password" help="Не короче 10 символов. Передайте его пользователю безопасным способом." required>
          <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <USwitch v-model="state.isSuperAdmin" label="Администратор (доступ ко всему, включая «Доступы»)" />
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="subtle" @click="open = false" />
        <UButton label="Создать" type="submit" form="user-form" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
