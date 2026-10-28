<script setup lang="ts">
import type { Grant, PageListItem, UpdateUserRequest, UserAccount } from '@crito/contract'

const props = defineProps<{ user?: UserAccount, selfId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const api = useApi()
const toast = useToast()
const { data: projects } = useProjects()

type Mode = 'none' | 'project' | 'pages'
interface Row { mode: Mode, pageIds: string[] }

const modeItems = [
  { label: 'Нет доступа', value: 'none' },
  { label: 'Весь проект', value: 'project' },
  { label: 'Отдельные страницы', value: 'pages' }
]

const rows = reactive<Record<string, Row>>({})
const pagesBySlug = reactive<Record<string, PageListItem[]>>({})
const profile = reactive({ name: '', isSuperAdmin: false, active: true })
const saving = ref(false)

async function loadPages(slug: string) {
  if (pagesBySlug[slug]) return
  try {
    pagesBySlug[slug] = await api<PageListItem[]>(`/projects/${slug}/pages`)
  } catch (error) {
    toast.add({ title: `Не удалось загрузить страницы «${slug}»`, description: apiErrorMessage(error), color: 'error' })
  }
}

// Форма заполняется при каждом открытии из текущих данных пользователя.
watch(open, (value) => {
  if (!value || !props.user) return
  profile.name = props.user.name ?? ''
  profile.isSuperAdmin = props.user.isSuperAdmin
  profile.active = props.user.active
  for (const key of Object.keys(rows)) delete rows[key]
  for (const project of projects.value) {
    const grant = props.user.grants.find(item => item.project === project.slug)
    rows[project.slug] = {
      mode: grant ? grant.scope : 'none',
      pageIds: grant?.scope === 'pages' ? [...grant.pageIds] : []
    }
    if (grant?.scope === 'pages') loadPages(project.slug)
  }
})

function pageOptions(slug: string) {
  return (pagesBySlug[slug] ?? []).map(page => ({ label: `${page.meta?.title ?? page.slug} (${page.slug})`, value: page.id }))
}

function onModeChange(slug: string, mode: Mode) {
  rows[slug]!.mode = mode
  if (mode === 'pages') loadPages(slug)
}

const isSelf = computed(() => props.user?.id === props.selfId)
const grantsValid = computed(() => Object.values(rows).every(row => row.mode !== 'pages' || row.pageIds.length > 0))

async function save() {
  const user = props.user
  if (!user) return
  saving.value = true
  try {
    const patch: UpdateUserRequest = {
      name: profile.name,
      isSuperAdmin: profile.isSuperAdmin,
      active: profile.active
    }
    await api(`/users/${user.id}`, { method: 'PATCH', body: patch })
    const grants: Grant[] = Object.entries(rows).flatMap(([project, row]): Grant[] =>
      row.mode === 'project'
        ? [{ project, scope: 'project' }]
        : row.mode === 'pages' ? [{ project, scope: 'pages', pageIds: row.pageIds }] : []
    )
    await api(`/users/${user.id}/grants`, { method: 'PUT', body: { grants } })
    toast.add({ title: 'Сохранено', color: 'success' })
    open.value = false
    emit('saved')
  } catch (error) {
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="user?.email ?? 'Пользователь'"
    description="Права действуют сразу после сохранения, в том числе в уже открытых сессиях."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div v-if="user" class="space-y-6">
        <section class="space-y-3">
          <UFormField label="Имя">
            <UInput v-model="profile.name" class="w-full" />
          </UFormField>
          <USwitch v-model="profile.isSuperAdmin" label="Администратор" description="Доступ ко всем проектам, настройкам и «Доступам»." />
          <USwitch
            v-model="profile.active"
            label="Вход разрешён"
            :description="isSelf ? 'Себя заблокировать нельзя.' : 'Выключение сразу завершает сессии пользователя.'"
            :disabled="isSelf"
          />
        </section>

        <section class="space-y-3">
          <h3 class="text-sm font-medium text-highlighted">
            Проекты
          </h3>
          <p v-if="profile.isSuperAdmin" class="text-sm text-muted">
            Администратору доступны все проекты, отдельные права не нужны.
          </p>
          <div v-for="project in projects" :key="project.slug" class="space-y-2 rounded-md border border-default p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium">{{ project.name }}</span>
              <USelect
                :model-value="rows[project.slug]?.mode ?? 'none'"
                :items="modeItems"
                class="w-56"
                @update:model-value="(mode: string) => onModeChange(project.slug, mode as Mode)"
              />
            </div>
            <USelectMenu
              v-if="rows[project.slug]?.mode === 'pages'"
              v-model="rows[project.slug]!.pageIds"
              :items="pageOptions(project.slug)"
              value-key="value"
              multiple
              placeholder="Выберите страницы"
              class="w-full"
            />
          </div>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <p v-if="!grantsValid" class="text-sm text-error">
          Для «Отдельных страниц» выберите хотя бы одну страницу.
        </p>
        <div class="ml-auto flex gap-2">
          <UButton label="Отмена" color="neutral" variant="subtle" @click="open = false" />
          <UButton label="Сохранить" :loading="saving" :disabled="!grantsValid" @click="save" />
        </div>
      </div>
    </template>
  </UModal>
</template>
