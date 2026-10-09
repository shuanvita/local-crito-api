<script setup lang="ts">
import type { PageDetail, PageRevisionItem } from '@crito/contract'

const props = defineProps<{
  project: string
  pageId: string
  currentVersion: number
  /** Откат запрещён, пока в редакторе есть несохранённые изменения. */
  locked?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ restored: [page: PageDetail] }>()

const api = useApi()
const toast = useToast()
const base = computed(() => `/projects/${props.project}/pages/${props.pageId}/revisions`)

const revisions = ref<PageRevisionItem[]>([])
const loading = ref(false)
const restoring = ref<number>()

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

async function restore(version: number) {
  restoring.value = version
  try {
    const page = await api<PageDetail>(`${base.value}/${version}/restore`, { method: 'POST' })
    toast.add({ title: `Версия ${version} восстановлена как ${page.version}`, color: 'success' })
    open.value = false
    emit('restored', page)
  } catch (error) {
    toast.add({ title: 'Не удалось восстановить версию', description: apiErrorMessage(error), color: 'error' })
  } finally {
    restoring.value = undefined
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="История изменений" description="Каждое сохранение создаёт новую версию. Откат тоже создаёт новую версию.">
    <template #body>
      <UAlert
        v-if="locked"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Есть несохранённые изменения"
        description="Сохраните их или перезагрузите страницу, чтобы восстановить старую версию."
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
              <UBadge v-if="revision.version === currentVersion" label="текущая" color="primary" variant="subtle" size="sm" class="ml-1" />
            </p>
            <p class="truncate text-xs text-muted">
              {{ dateFormat.format(new Date(revision.createdAt)) }} · {{ revision.author?.name ?? revision.author?.email ?? 'неизвестно' }}
            </p>
          </div>
          <UButton
            v-if="revision.version !== currentVersion"
            label="Восстановить"
            size="xs"
            color="neutral"
            variant="subtle"
            :disabled="locked"
            :loading="restoring === revision.version"
            @click="restore(revision.version)"
          />
        </li>
      </ul>
    </template>
  </USlideover>
</template>
