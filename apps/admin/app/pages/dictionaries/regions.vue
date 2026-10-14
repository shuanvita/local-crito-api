<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { RegionItem } from '@crito/contract'

const api = useApi()
const toast = useToast()

useHead({ title: 'Справочник «Регионы»' })

const { data: me } = await useMe()
// Справочник общий для всех сайтов: править его может только администратор админки. Остальные его видят.
const canEdit = computed(() => me.value?.isSuperAdmin === true)

const { data: regions, status, refresh } = await useAsyncData(
  'regions',
  () => api<RegionItem[]>('/dictionaries/regions'),
  { default: () => [] }
)

const search = ref('')
const rows = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return regions.value
  return regions.value.filter(region => region.label.toLowerCase().includes(query) || String(region.value).includes(query))
})

const columns = computed<TableColumn<RegionItem>[]>(() => [
  { accessorKey: 'label', header: 'Название' },
  { accessorKey: 'value', header: 'Идентификатор' },
  { accessorKey: 'sortOrder', header: 'Порядок' },
  ...(canEdit.value ? [{ id: 'actions', header: '' }] : [])
])

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
    await api(`/dictionaries/regions/${region.id}`, { method: 'DELETE' })
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
      <UDashboardNavbar title="Справочник «Регионы»">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template v-if="canEdit" #right>
          <UButton label="Добавить регион" icon="i-lucide-plus" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        :title="canEdit ? 'Общий справочник' : 'Справочник только для чтения'"
        :description="canEdit
          ? 'Справочник общий для всех проектов: правка сразу меняется на всех сайтах.'
          : 'Справочник общий для всех проектов. Править его может только администратор админки.'"
        class="mb-4"
      />

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
  </UDashboardPanel>

  <RegionModal
    v-model:open="formOpen"
    :region="editing"
    :next-sort-order="nextSortOrder"
    @saved="refresh()"
  />

  <ConfirmModal
    v-model:open="confirmOpen"
    title="Удалить регион?"
    :description="toDelete ? `«${toDelete.label}» пропадёт из справочника и со всех сайтов. Это нельзя отменить.` : ''"
    confirm-label="Удалить"
    :loading="busy"
    @confirm="confirmDelete"
  />
</template>
