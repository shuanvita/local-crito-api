<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PageListItem, ProjectSummary, TrashedPageItem } from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)

useHead({ title: 'Страницы' })

const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)

const { data: pages, status, refresh } = await useAsyncData(
  () => `pages:${project.value}`,
  () => api<PageListItem[]>(`/projects/${project.value}/pages`),
  { default: () => [], watch: [project] }
)

// Создание, удаление и корзина доступны только при доступе ко всему проекту.
const fullAccess = computed(() => current.value?.fullAccess === true)

// --- корзина ---
type View = 'pages' | 'trash'
const view = ref<View>('pages')

const { data: trash, status: trashStatus, execute: loadTrash } = await useAsyncData(
  () => `trash:${project.value}`,
  () => api<TrashedPageItem[]>(`/projects/${project.value}/pages/trash`),
  { default: () => [], immediate: false, watch: [project] }
)

watch([view, fullAccess], ([value, allowed]) => {
  if (value === 'trash' && allowed) loadTrash()
  if (!allowed) view.value = 'pages'
})

const tabs = computed(() => [
  { label: `Страницы (${pages.value.length})`, value: 'pages' },
  { label: view.value === 'trash' ? `Корзина (${trash.value.length})` : 'Корзина', value: 'trash', icon: 'i-lucide-trash-2' }
])

const createOpen = ref(false)
const search = ref('')

const matches = <T extends PageListItem>(items: T[]) => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items
  return items.filter(page => page.slug.includes(query) || (page.meta?.title ?? '').toLowerCase().includes(query))
}
const pageRows = computed(() => matches(pages.value))
const trashRows = computed(() => matches(trash.value))

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => dateFormat.format(new Date(value))

const pageColumns = computed<TableColumn<PageListItem>[]>(() => [
  { accessorKey: 'slug', header: 'Адрес' },
  { id: 'title', header: 'Заголовок', cell: ({ row }) => row.original.meta?.title ?? '—' },
  { accessorKey: 'version', header: 'Версия' },
  { accessorKey: 'updatedAt', header: 'Изменена', cell: ({ row }) => formatDate(row.original.updatedAt) },
  ...(fullAccess.value ? [{ id: 'actions', header: '' }] : [])
])

const trashColumns: TableColumn<TrashedPageItem>[] = [
  { accessorKey: 'slug', header: 'Адрес' },
  { id: 'title', header: 'Заголовок', cell: ({ row }) => row.original.meta?.title ?? '—' },
  { id: 'deleted', header: 'Удалена', cell: ({ row }) => `${formatDate(row.original.deletedAt)} · ${row.original.deletedBy?.name ?? row.original.deletedBy?.email ?? 'неизвестно'}` },
  { id: 'actions', header: '' }
]

function openPage(_event: Event, row: { original: PageListItem }) {
  navigateTo(`/${project.value}/pages/${row.original.id}`)
}

// --- действия с подтверждением ---
type Pending = { kind: 'trash' | 'purge', slug: string, id: string }
const pending = ref<Pending>()
const busy = ref(false)
const confirmOpen = computed({
  get: () => !!pending.value,
  set: (value) => { if (!value) pending.value = undefined }
})

async function reloadLists() {
  await Promise.all([refresh(), view.value === 'trash' || trash.value.length ? loadTrash() : Promise.resolve()])
}

async function restore(item: { id: string, slug: string }) {
  try {
    await api(`/projects/${project.value}/pages/${item.id}/restore`, { method: 'POST' })
    toast.add({ title: `Страница ${item.slug} восстановлена`, color: 'success' })
    await reloadLists()
  } catch (error) {
    toast.add({ title: 'Не удалось восстановить страницу', description: apiErrorMessage(error), color: 'error' })
  }
}

async function confirmAction() {
  const action = pending.value
  if (!action) return
  busy.value = true
  try {
    if (action.kind === 'trash') {
      await api(`/projects/${project.value}/pages/${action.id}`, { method: 'DELETE' })
      toast.add({
        title: `Страница ${action.slug} перемещена в корзину`,
        description: 'С сайта она уже убрана; из корзины её можно вернуть.',
        actions: [{ label: 'Отменить', color: 'neutral', variant: 'outline', onClick: () => restore(action) }]
      })
    } else {
      await api(`/projects/${project.value}/pages/${action.id}/purge`, { method: 'DELETE' })
      toast.add({ title: `Страница ${action.slug} удалена навсегда`, color: 'success' })
    }
    pending.value = undefined
    await reloadLists()
  } catch (error) {
    toast.add({ title: 'Не удалось выполнить действие', description: apiErrorMessage(error), color: 'error' })
    pending.value = undefined
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="pages">
    <template #header>
      <UDashboardNavbar :title="current ? `Страницы · ${current.name}` : 'Страницы'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template v-if="fullAccess" #right>
          <UButton
            label="Новая страница"
            icon="i-lucide-plus"
            :disabled="!current?.manifestHash"
            @click="createOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="current && !current.manifestHash"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Манифест блоков не загружен"
        description="Страницы нельзя создавать и сохранять, пока CI сайта не опубликует манифест (PUT /projects/:project/manifest)."
        class="mb-4"
      />

      <UTabs
        v-if="fullAccess"
        v-model="view"
        :items="tabs"
        :content="false"
        size="sm"
        class="mb-4 max-w-sm"
      />

      <div class="mb-4 flex items-center gap-2">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск по адресу или заголовку" class="max-w-sm flex-1" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" aria-label="Обновить" @click="reloadLists()" />
      </div>

      <!-- страницы -->
      <UTable
        v-if="view === 'pages'"
        :data="pageRows"
        :columns="pageColumns"
        :loading="status === 'pending'"
        class="shrink-0"
        :ui="{ tr: 'cursor-pointer' }"
        @select="openPage"
      >
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Переместить в корзину"
              @click.stop="pending = { kind: 'trash', slug: row.original.slug, id: row.original.id }"
            />
          </div>
        </template>
        <template #empty>
          <p class="py-6 text-center text-muted">
            Страниц пока нет
          </p>
        </template>
      </UTable>

      <!-- корзина -->
      <template v-else>
        <p class="mb-3 text-sm text-muted">
          Удалённые страницы не показываются на сайте, но хранятся вместе с историей. Адрес остаётся занятым, пока страницу не восстановят или не удалят навсегда.
        </p>
        <UTable :data="trashRows" :columns="trashColumns" :loading="trashStatus === 'pending'" class="shrink-0">
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton label="Восстановить" icon="i-lucide-undo-2" size="xs" color="neutral" variant="subtle" @click="restore(row.original)" />
              <UButton
                icon="i-lucide-trash"
                size="xs"
                color="error"
                variant="ghost"
                aria-label="Удалить навсегда"
                @click="pending = { kind: 'purge', slug: row.original.slug, id: row.original.id }"
              />
            </div>
          </template>
          <template #empty>
            <p class="py-6 text-center text-muted">
              Корзина пуста
            </p>
          </template>
        </UTable>
      </template>

      <CreatePageModal v-model:open="createOpen" :project="project" />

      <ConfirmModal
        v-model:open="confirmOpen"
        :title="pending?.kind === 'purge' ? 'Удалить страницу навсегда?' : 'Переместить страницу в корзину?'"
        :description="pending?.kind === 'purge'
          ? `Страница ${pending.slug} и вся её история будут удалены без возможности восстановления.`
          : pending ? `Страница ${pending.slug} пропадёт с сайта. Вернуть её можно из корзины.` : undefined"
        :confirm-label="pending?.kind === 'purge' ? 'Удалить навсегда' : 'В корзину'"
        :loading="busy"
        @confirm="confirmAction"
      />
    </template>
  </UDashboardPanel>
</template>
