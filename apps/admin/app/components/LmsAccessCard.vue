<script setup lang="ts">
import type { LmsAccess, LmsRoleProfile, PageListItem } from '@crito/contract'

const props = defineProps<{ project: string }>()

const api = useApi()
const toast = useToast()

const scopeItems = [
  { label: 'Весь проект', value: 'project' },
  { label: 'Отдельные страницы', value: 'pages' }
]

// Шаблоны ролей: имя роли LMS любое, эти две подсказаны как типовые.
const templates: LmsRoleProfile[] = [
  { role: 'manager', scope: 'project', pageIds: [], requests: true },
  { role: 'editor', scope: 'pages', pageIds: [], requests: false }
]

const { data: loaded, refresh } = await useAsyncData(
  () => `lms-access:${props.project}`,
  () => api<LmsAccess>(`/projects/${props.project}/lms-access`),
  { watch: [() => props.project] }
)
const { data: pages } = await useAsyncData(
  () => `lms-access-pages:${props.project}`,
  () => api<PageListItem[]>(`/projects/${props.project}/pages`),
  { watch: [() => props.project], default: () => [] }
)

const groups = ref<string[]>([])
const roles = ref<LmsRoleProfile[]>([])

function fill(source: LmsAccess | null | undefined) {
  groups.value = [...(source?.groups ?? [])]
  roles.value = (source?.roles ?? []).map(role => ({ ...role, pageIds: [...role.pageIds] }))
}
fill(loaded.value)
watch(loaded, fill)

const snapshot = (value: LmsAccess) => JSON.stringify(value)
const current = computed<LmsAccess>(() => ({ groups: groups.value, roles: roles.value }))
const dirty = computed(() => !!loaded.value && snapshot(current.value) !== snapshot(loaded.value))

const pageOptions = computed(() =>
  (pages.value ?? []).map(page => ({ label: `${page.meta?.title ?? page.slug} (${page.slug})`, value: page.id }))
)

const usedRoles = computed(() => new Set(roles.value.map(role => role.role.trim().toLowerCase())))
const freeTemplates = computed(() => templates.filter(template => !usedRoles.value.has(template.role)))

function addRole(template?: LmsRoleProfile) {
  roles.value.push(template ? { ...template, pageIds: [] } : { role: '', scope: 'project', pageIds: [], requests: false })
}

const rolesValid = computed(() => {
  const names = roles.value.map(role => role.role.trim().toLowerCase())
  return names.every(Boolean)
    && new Set(names).size === names.length
    && roles.value.every(role => role.scope === 'project' || role.pageIds.length > 0)
})

const saving = ref(false)

async function save() {
  if (!dirty.value || !rolesValid.value || saving.value) return
  saving.value = true
  try {
    const body: LmsAccess = {
      groups: groups.value.map(group => group.trim()).filter(Boolean),
      roles: roles.value.map(role => ({
        role: role.role.trim().toLowerCase(),
        scope: role.scope,
        pageIds: role.scope === 'pages' ? role.pageIds : [],
        requests: role.requests
      }))
    }
    loaded.value = await api<LmsAccess>(`/projects/${props.project}/lms-access`, { method: 'PUT', body })
    toast.add({ title: 'Доступ из LMS сохранён', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(error), color: 'error' })
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-5' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-medium text-highlighted">
          Доступ из LMS
        </h2>
        <UButton
          label="Сохранить"
          icon="i-lucide-save"
          :disabled="!dirty || !rolesValid"
          :loading="saving"
          class="cursor-pointer"
          @click="save"
        />
      </div>
    </template>

    <UFormField
      label="Группы LMS"
      description="Участники этих групп попадают в проект. Состав групп правят в LMS. Укажите id группы и нажмите Enter."
    >
      <UInputTags v-model="groups" placeholder="id группы" class="w-full" />
    </UFormField>

    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-medium text-highlighted">
          Роли
        </h3>
        <p class="text-sm text-muted">
          Роль приходит из LMS. Что она даёт в этом проекте, задаётся здесь; роль без строки в списке доступа не даёт.
        </p>
      </div>

      <div v-for="(role, index) in roles" :key="index" class="space-y-2 rounded-md border border-default p-3">
        <div class="flex flex-wrap items-center gap-2">
          <UInput v-model="role.role" placeholder="Роль в LMS" class="w-44 font-mono" />
          <USelect v-model="role.scope" :items="scopeItems" class="w-52" />
          <USwitch v-model="role.requests" label="Заявки" />
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            class="ml-auto cursor-pointer"
            aria-label="Убрать роль"
            @click="roles.splice(index, 1)"
          />
        </div>
        <USelectMenu
          v-if="role.scope === 'pages'"
          v-model="role.pageIds"
          :items="pageOptions"
          value-key="value"
          multiple
          placeholder="Выберите страницы"
          class="w-full"
        />
      </div>

      <p v-if="!rolesValid" class="text-sm text-error">
        У каждой роли должно быть уникальное название, а для «Отдельных страниц» выбрана хотя бы одна страница.
      </p>

      <div class="flex flex-wrap gap-2">
        <UButton label="Добавить роль" icon="i-lucide-plus" color="neutral" variant="subtle" class="cursor-pointer" @click="addRole()" />
        <UButton
          v-for="template in freeTemplates"
          :key="template.role"
          :label="`Шаблон: ${template.role}`"
          color="neutral"
          variant="ghost"
          class="cursor-pointer"
          @click="addRole(template)"
        />
      </div>
    </div>
  </UCard>
</template>
