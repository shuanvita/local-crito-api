<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { ChangePasswordRequest } from '@crito/contract'

const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const toast = useToast()

const schema = z.object({
  currentPassword: z.string().min(1, 'Укажите текущий пароль'),
  newPassword: z.string().min(10, 'Не короче 10 символов').max(200, 'Не длиннее 200 символов')
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const loading = ref(false)

watch(open, (value) => {
  if (!value) return
  state.currentPassword = ''
  state.newPassword = ''
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await api('/auth/password', { method: 'POST', body: event.data satisfies ChangePasswordRequest })
    toast.add({ title: 'Пароль изменён', description: 'На других устройствах нужно войти заново.', color: 'success' })
    open.value = false
  } catch (error) {
    toast.add({ title: 'Не удалось сменить пароль', description: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Смена пароля">
    <template #body>
      <UForm id="password-form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Текущий пароль" name="currentPassword" required>
          <UInput v-model="state.currentPassword" type="password" autocomplete="current-password" class="w-full" />
        </UFormField>
        <UFormField label="Новый пароль" name="newPassword" help="Не короче 10 символов." required>
          <UInput v-model="state.newPassword" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="subtle" @click="open = false" />
        <UButton label="Сменить" type="submit" form="password-form" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
