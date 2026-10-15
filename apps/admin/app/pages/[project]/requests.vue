<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormSubmissionDetail, FormSubmissionItem, FormSubmissionList, ProjectSummary } from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)

useHead({ title: 'Заявки' })

const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)
// Заявки видны только при доступе ко всему проекту (API отдаёт 403 остальным).
const fullAccess = computed(() => current.value?.fullAccess === true)

// --- фильтры ---
const ALL = 'all'
const search = ref('')
const debouncedSearch = refDebounced(search, 300)
const form = ref(ALL)
const from = ref('')
const to = ref('')

// Даты вводятся по местному времени: границы суток переводим в ISO для API.
const dayStart = (value: string) => new Date(`${value}T00:00:00`)
const nextDayStart = (value: string) => {
  const date = dayStart(value)
  date.setDate(date.getDate() + 1)
  return date
}

const query = computed(() => ({
  q: debouncedSearch.value.trim() || undefined,
  form: form.value === ALL ? undefined : form.value,
  from: from.value ? dayStart(from.value).toISOString() : undefined,
  to: to.value ? nextDayStart(to.value).toISOString() : undefined
}))
const hasFilters = computed(() => Boolean(search.value || form.value !== ALL || from.value || to.value))

function resetFilters() {
  search.value = ''
  form.value = ALL
  from.value = ''
  to.value = ''
}

// --- список с подгрузкой по курсору ---
const items = ref<FormSubmissionItem[]>([])
const total = ref(0)
const forms = ref<string[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
// Ответ на устаревшие фильтры не должен затереть свежий.
let requestId = 0

async function load(more = false) {
  if (!fullAccess.value) return
  const id = ++requestId
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const response = await api<FormSubmissionList>(`/projects/${project.value}/requests`, {
      query: { ...query.value, cursor: more ? nextCursor.value ?? undefined : undefined }
    })
    if (id !== requestId) return
    items.value = more ? [...items.value, ...response.items] : response.items
    total.value = response.total
    forms.value = response.forms
    nextCursor.value = response.nextCursor
  } catch (error) {
    if (id !== requestId) return
    toast.add({ title: 'Не удалось загрузить заявки', description: apiErrorMessage(error), color: 'error' })
  } finally {
    if (id === requestId) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

watch([query, project, fullAccess], () => load(), { immediate: true })

// Смена проекта: фильтры другого проекта не переносим (формы и даты там могут быть другими).
watch(project, () => {
  resetFilters()
  items.value = []
  selected.value = undefined
})

const formItems = computed(() => [
  { label: 'Все формы', value: ALL },
  ...forms.value.map(value => ({ label: value, value }))
])

// --- таблица ---
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => dateFormat.format(new Date(value))

const UBadgeComponent = resolveComponent('UBadge')

const columns: TableColumn<FormSubmissionItem>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Получена',
    cell: ({ row }) => h('span', { class: 'whitespace-nowrap text-sm text-toned' }, formatDate(row.original.createdAt))
  },
  {
    id: 'person',
    header: 'Заявитель',
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'truncate font-medium text-highlighted' }, row.original.name || 'Без имени'),
      h('p', { class: 'truncate text-xs text-muted' }, [row.original.email, row.original.phone].filter(Boolean).join(' · ') || '—')
    ])
  },
  {
    id: 'form',
    header: 'Форма',
    cell: ({ row }) => h(UBadgeComponent, { color: 'neutral', variant: 'subtle', size: 'md', label: row.original.form })
  }
]

// --- просмотр заявки ---
const selected = ref<FormSubmissionItem>()
const detail = ref<FormSubmissionDetail>()
const detailLoading = ref(false)
const slideoverOpen = computed({
  get: () => !!selected.value,
  set: (value) => { if (!value) selected.value = undefined }
})

async function openRow(_event: Event, row: { original: FormSubmissionItem }) {
  selected.value = row.original
  detail.value = undefined
  detailLoading.value = true
  const id = row.original.id
  try {
    const response = await api<FormSubmissionDetail>(`/projects/${project.value}/requests/${id}`)
    if (selected.value?.id === id) detail.value = response
  } catch (error) {
    toast.add({ title: 'Не удалось открыть заявку', description: apiErrorMessage(error), color: 'error' })
    if (selected.value?.id === id) selected.value = undefined
  } finally {
    detailLoading.value = false
  }
}

const fieldValue = (value: string | string[]) => Array.isArray(value) ? value.join(', ') : value
</script>

<template>
  <UDashboardPanel id="requests">
    <template #header>
      <UDashboardNavbar title="Заявки">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template v-if="fullAccess" #right>
          <UButton
            label="Обновить"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="loading"
            @click="load()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="current && !fullAccess"
        color="warning"
        variant="subtle"
        icon="i-lucide-lock"
        title="Нет доступа к заявкам"
        description="Заявки содержат персональные данные и доступны только при доступе ко всему проекту."
      />

      <template v-else>
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Поиск по имени, почте, телефону и тексту"
            class="w-full sm:w-80"
          />
          <USelect v-model="form" :items="formItems" class="w-48" aria-label="Форма" />
          <UInput v-model="from" type="date" class="w-40" aria-label="С даты" :max="to || undefined" />
          <UInput v-model="to" type="date" class="w-40" aria-label="По дату" :min="from || undefined" />
          <UButton
            v-if="hasFilters"
            label="Сбросить"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            @click="resetFilters"
          />
        </div>

        <UTable
          :data="items"
          :columns="columns"
          :loading="loading"
          :on-select="openRow"
          class="rounded-lg border border-default"
        >
          <template #empty>
            <p class="py-8 text-center text-sm text-muted">
              {{ hasFilters ? 'По этим фильтрам заявок нет' : 'Заявок пока нет' }}
            </p>
          </template>
        </UTable>

        <div class="mt-4 flex items-center justify-between gap-2 text-sm text-muted">
          <span>Показано {{ items.length }} из {{ total }}</span>
          <UButton
            v-if="nextCursor"
            label="Показать ещё"
            color="neutral"
            variant="outline"
            :loading="loadingMore"
            @click="load(true)"
          />
        </div>
      </template>

      <USlideover v-model:open="slideoverOpen" title="Заявка" :description="selected ? formatDate(selected.createdAt) : undefined">
        <template #body>
          <div v-if="detailLoading" class="flex justify-center py-8">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
          </div>
          <div v-else-if="detail" class="space-y-4">
            <dl class="space-y-3">
              <div>
                <dt class="text-xs text-muted">Форма</dt>
                <dd class="text-sm">{{ detail.form }}</dd>
              </div>
              <div v-if="detail.pageUrl">
                <dt class="text-xs text-muted">Страница</dt>
                <dd class="break-all text-sm">{{ detail.pageUrl }}</dd>
              </div>
            </dl>
            <USeparator />
            <dl class="space-y-3">
              <div v-for="(value, key) in detail.fields" :key="key">
                <dt class="font-mono text-xs text-muted">{{ key }}</dt>
                <!-- Значения выводятся как текст: HTML из заявки не интерпретируется. -->
                <dd class="whitespace-pre-wrap break-words text-sm">{{ fieldValue(value) || '—' }}</dd>
              </div>
            </dl>
          </div>
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
