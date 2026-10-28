<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { UserAccount } from '@crito/contract'

const api = useApi()

useHead({ title: 'Доступы' })

const { data: me, status: meStatus } = await useMe()
// Раздел только для администратора (права всё равно проверяет API).
if (meStatus.value === 'success' && !me.value?.isSuperAdmin) {
  await navigateTo('/no-access')
}

const { data: users, status, refresh } = await useAsyncData('users', () => api<UserAccount[]>('/users'), {
  default: () => []
})
const { data: projects } = useProjects()

const columns: TableColumn<UserAccount>[] = [
  { accessorKey: 'email', header: 'Почта' },
  { accessorKey: 'name', header: 'Имя' },
  { id: 'access', header: 'Доступ' },
  { id: 'state', header: 'Состояние' },
  { id: 'actions', header: '' }
]

function accessLabel(user: UserAccount): string {
  if (user.isSuperAdmin) return 'Администратор'
  if (user.grants.length === 0) return 'Нет прав'
  return user.grants
    .map((grant) => {
      const name = projects.value.find(project => project.slug === grant.project)?.name ?? grant.project
      return grant.scope === 'project' ? name : `${name}: ${grant.pageIds.length} стр.`
    })
    .join(', ')
}

const createOpen = ref(false)
const editing = ref<UserAccount>()
const editOpen = computed({
  get: () => !!editing.value,
  set: (value) => { if (!value) editing.value = undefined }
})
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Доступы">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton label="Новый пользователь" icon="i-lucide-user-plus" @click="createOpen = true" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="users" :columns="columns" :loading="status === 'pending'">
        <template #access-cell="{ row }">
          <span class="text-sm">{{ accessLabel(row.original) }}</span>
        </template>
        <template #state-cell="{ row }">
          <UBadge
            :label="row.original.active ? 'Активен' : 'Заблокирован'"
            :color="row.original.active ? 'success' : 'error'"
            variant="subtle"
          />
        </template>
        <template #actions-cell="{ row }">
          <UButton label="Изменить" color="neutral" variant="subtle" size="sm" @click="editing = row.original" />
        </template>
        <template #empty>
          <p class="py-6 text-center text-muted">
            Пользователей пока нет.
          </p>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <UserModal v-model:open="createOpen" @saved="refresh" />
  <UserAccessModal v-model:open="editOpen" :user="editing" :self-id="me?.id" @saved="refresh" />
</template>
