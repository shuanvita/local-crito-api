<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ProjectSummary, RegionItem } from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)

useHead({ title: 'Справочник «Регионы»' })

const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)

// Справочники это данные всего проекта: доступ только к отдельным страницам их не открывает.
const fullAccess = computed(() => current.value?.fullAccess === true)

const { data: regions, status, refresh } = await useAsyncData(
  () => `regions:${project.value}`,
  () => fullAccess.value
    ? api<RegionItem[]>(`/projects/${project.value}/dictionaries/regions`)
    : Promise.resolve([] as RegionItem[]),
  { default: () => [], watch: [project, fullAccess] }
)

const search = ref('')
const rows = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return regions.value
  return regions.value.filter(region => region.label.toLowerCase().includes(query) || String(region.value).includes(query))
})

const columns: TableColumn<RegionItem>[] = [
  { accessorKey: 'label', header: 'Название' },
  { accessorKey: 'value', header: 'Идентификатор' },
  { accessorKey: 'sortOrder', header: 'Порядок' },
  { id: 'actions', header: '' }
]

// --- создание и правка ---
const editing = ref<RegionItem>()
const formOpen = ref(false)
const nextSortOrder = computed(() => (regions.value.at(-1)?.sortOrder ?? 0) + 10)

function openCreate() {
  editing.value = undefined
  formOpen.value = true
}

function openEdit(region: RegionItem) {
  editing.value = region
  formOpen.value = true
}

// --- удаление ---
const toDelete = ref<RegionItem>()
const busy = ref(false)
const confirmOpen = computed({
  get: () => !!toDelete.value,
  set: (value) => { if (!value) toDelete.value = undefined }
})

async function confirmDelete() {
  const region = toDelete.value
  if (!region) return
  busy.value = true
  try {
    await api(`/projects/${project.value}/dictionaries/regions/${region.id}`, { method: 'DELETE' })
    toast.add({ title: `Регион «${region.label}» удалён`, color: 'success' })
    await refresh()
  } catch (error) {
    toast.add({ title: 'Не удалось удалить регион', description: apiErrorMessage(error), color: 'error' })
  } finally {
    toDelete.value = undefined
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="dictionary-regions">
    <template #header>
      <UDashboardNavbar :title="current ? `Регионы · ${current.name}` : 'Регионы'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template v-if="fullAccess" #right>
          <UButton label="Добавить регион" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="current && !fullAccess"
        color="warning"
        variant="subtle"
        icon="i-lucide-lock"
        title="Нет доступа к справочникам"
        description="Справочники проекта доступны только тем, у кого есть доступ ко всему проекту."
      />

      <template v-else>
        <div class="mb-4 flex items-center gap-2">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск по названию или идентификатору" class="max-w-sm flex-1" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" aria-label="Обновить" @click="refresh()" />
          <span class="ml-auto text-sm text-muted">Всего: {{ regions.length }}</span>
        </div>

        <UTable :data="rows" :columns="columns" :loading="status === 'pending'" class="shrink-0">
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Изменить"
                @click="openEdit(row.original)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Удалить"
                @click="toDelete = row.original"
              />
            </div>
          </template>
          <template #empty>
            <p class="py-6 text-center text-muted">
              {{ search ? 'Ничего не найдено' : 'Регионов пока нет' }}
            </p>
          </template>
        </UTable>
      </template>
    </template>
  </UDashboardPanel>

  <RegionModal
    v-model:open="formOpen"
    :project="project"
    :region="editing"
    :next-sort-order="nextSortOrder"
    @saved="refresh()"
  />

  <ConfirmModal
    v-model:open="confirmOpen"
    title="Удалить регион?"
    :description="toDelete ? `«${toDelete.label}» пропадёт из справочника и с сайта. Это нельзя отменить.` : ''"
    confirm-label="Удалить"
    :loading="busy"
    @confirm="confirmDelete"
  />
</template>
