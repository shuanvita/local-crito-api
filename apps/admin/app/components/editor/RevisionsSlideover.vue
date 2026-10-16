<script setup lang="ts">
import type { PageRevisionDetail, PageRevisionItem } from '@crito/contract'

const props = defineProps<{
  project: string
  pageId: string
  /** Опубликованная сейчас версия (её видят посетители). */
  currentVersion: number
  /** Версия из истории, открытая в редакторе; null: открыта обычная страница. */
  viewingVersion?: number | null
  /** Есть сохранённый черновик поверх опубликованной версии. */
  hasDraft?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
/** Версию выбрали: редактор показывает её содержимое (и в предпросмотре), ничего не публикуя. */
const emit = defineEmits<{ open: [revision: PageRevisionDetail] }>()

const api = useApi()
const toast = useToast()
const base = computed(() => `/projects/${props.project}/pages/${props.pageId}/revisions`)

const revisions = ref<PageRevisionItem[]>([])
const loading = ref(false)
const opening = ref<number>()

watch(open, async (isOpen) => {
  if (!isOpen) return
  loading.value = true
  try {
    revisions.value = await api<PageRevisionItem[]>(base.value)
  } catch (error) {
    toast.add({ title: 'Не удалось загрузить историю', description: apiErrorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
})

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

async function show(version: number) {
  opening.value = version
  try {
    emit('open', await api<PageRevisionDetail>(`${base.value}/${version}`))
  } catch (error) {
    toast.add({ title: 'Не удалось открыть версию', description: apiErrorMessage(error), color: 'error' })
  } finally {
    opening.value = undefined
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="История версий" description="Версия появляется при публикации. Выберите её, чтобы увидеть в редакторе и предпросмотре: на сайте ничего не изменится, пока вы не опубликуете.">
    <template #body>
      <UAlert
        v-if="hasDraft"
        color="info"
        variant="subtle"
        icon="i-lucide-file-pen-line"
        title="Есть сохранённый черновик"
        description="Он ещё не опубликован. Если открыть версию из списка, в редакторе окажется её содержимое; черновик останется, пока вы не сохраните поверх него."
        class="mb-4"
      />

      <p v-if="loading" class="text-sm text-muted">
        Загрузка…
      </p>

      <ul v-else class="divide-y divide-default">
        <li v-for="revision in revisions" :key="revision.version" class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              Версия {{ revision.version }}
              <UBadge v-if="revision.version === currentVersion" label="на сайте" color="primary" variant="subtle" size="sm" class="ml-1" />
              <UBadge v-if="revision.version === viewingVersion" label="открыта" color="info" variant="subtle" size="sm" class="ml-1" />
            </p>
            <p class="truncate text-xs text-muted">
              {{ dateFormat.format(new Date(revision.createdAt)) }} · {{ revision.author?.name ?? revision.author?.email ?? 'неизвестно' }}
            </p>
          </div>
          <UButton
            label="Открыть"
            icon="i-lucide-eye"
            size="xs"
            color="neutral"
            variant="subtle"
            :disabled="revision.version === viewingVersion"
            :loading="opening === revision.version"
            @click="show(revision.version)"
          />
        </li>
      </ul>
    </template>
  </USlideover>
</template>
