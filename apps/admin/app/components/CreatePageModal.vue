<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CreatePageRequest, PageDetail } from '@crito/contract'

const props = defineProps<{ project: string }>()
const open = defineModel<boolean>('open', { default: false })

const api = useApi()
const toast = useToast()

const schema = z.object({
  slug: z.string()
    .min(1, 'Укажите адрес')
    .regex(/^\/?([a-z0-9][a-z0-9_-]*)(\/[a-z0-9][a-z0-9_-]*)*$/, 'Строчные латинские буквы, цифры, «-» и «_»; сегменты через «/»'),
  title: z.string().optional()
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ slug: '', title: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const page = await api<PageDetail>(`/projects/${props.project}/pages`, {
      method: 'POST',
      body: {
        slug: event.data.slug,
        blocks: [],
        ...(event.data.title ? { meta: { title: event.data.title } } : {})
      } satisfies CreatePageRequest
    })
    open.value = false
    state.slug = ''
    state.title = ''
    await navigateTo(`/${props.project}/pages/${page.id}`)
  } catch (error) {
    toast.add({ title: 'Не удалось создать страницу', description: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Новая страница" description="Пустая страница без блоков. Блоки добавляются в редакторе.">
    <template #body>
      <UForm id="create-page" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Адрес" name="slug" help="Например, /champ или /news/2026. Главная страница — /index." required>
          <UInput v-model="state.slug" placeholder="/champ" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Заголовок (SEO)" name="title">
          <UInput v-model="state.title" class="w-full" />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="subtle" @click="open = false" />
        <UButton label="Создать" type="submit" form="create-page" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
