<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CreateRegionRequest, RegionItem } from '@crito/contract'

const props = defineProps<{
  project: string
  /** Регион для правки; без него модалка создаёт новый. */
  region?: RegionItem
  /** Значение «Порядка» для нового региона: конец списка. */
  nextSortOrder: number
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const toast = useToast()

const schema = z.object({
  value: z.number({ error: 'Укажите идентификатор' }).int('Целое число').min(0, 'Не меньше 0'),
  label: z.string().trim().min(1, 'Укажите название').max(200, 'Не длиннее 200 символов'),
  sortOrder: z.number({ error: 'Укажите порядок' }).int('Целое число').min(0, 'Не меньше 0')
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({})
const loading = ref(false)

// Форма заполняется при каждом открытии: правка берёт значения региона, создание предлагает конец списка.
watch(open, (value) => {
  if (!value) return
  state.value = props.region?.value
  state.label = props.region?.label ?? ''
  state.sortOrder = props.region?.sortOrder ?? props.nextSortOrder
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  const base = `/projects/${props.project}/dictionaries/regions`
  try {
    if (props.region) {
      await api(`${base}/${props.region.id}`, { method: 'PATCH', body: event.data })
    } else {
      await api(base, { method: 'POST', body: event.data satisfies CreateRegionRequest })
    }
    open.value = false
    emit('saved')
  } catch (error) {
    toast.add({ title: 'Не удалось сохранить регион', description: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="region ? 'Изменить регион' : 'Новый регион'"
    description="Изменения сразу видны сайту: сохранение публикует справочник."
  >
    <template #body>
      <UForm id="region-form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Название" name="label" required>
          <UInput v-model="state.label" placeholder="Республика Адыгея (Адыгея)" class="w-full" autofocus />
        </UFormField>
        <UFormField
          label="Идентификатор"
          name="value"
          help="Числовой код региона во внешней системе: сайт отправляет его как есть. Уникален в проекте."
          required
        >
          <UInputNumber
            v-model="state.value"
            :increment="false"
            :decrement="false"
            :format-options="{ useGrouping: false }"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Порядок" name="sortOrder" help="Чем меньше число, тем выше регион в списке." required>
          <UInputNumber
            v-model="state.sortOrder"
            :format-options="{ useGrouping: false }"
            :min="0"
            :step="10"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Отмена" color="neutral" variant="subtle" @click="open = false" />
        <UButton label="Сохранить" type="submit" form="region-form" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
