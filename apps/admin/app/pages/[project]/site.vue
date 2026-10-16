<script setup lang="ts">
import type { BlockManifest, ProjectSettingsResponse, ProjectSummary, SiteSettings, UpdateSettingsRequest } from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)

useHead({ title: 'Общее для сайта' })

// Тот же ключ, что в редакторе страницы: ответ берётся из кэша.
const { data: manifest } = await useAsyncData(
  () => `manifest:${project.value}`,
  () => api<BlockManifest | null>(`/projects/${project.value}/manifest`),
  { watch: [project] }
)
const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)
const { data: stored, error } = await useAsyncData(
  () => `site-settings:${project.value}`,
  () => api<ProjectSettingsResponse>(`/projects/${project.value}/settings`),
  { watch: [project] }
)

// Общие настройки меняет тот, у кого есть доступ ко всему проекту (API всё равно проверит права).
const canEdit = computed(() => current.value?.fullAccess === true)
const schema = computed(() => manifest.value?.settingsSchema)

const value = ref<SiteSettings>({})
const snapshot = ref('')

/** Пустые строки в необязательных полях не отправляем: их не ждёт ни схема, ни сайт. */
const payload = (source: SiteSettings) => pruneEmpty(source)

function fill() {
  const source = stored.value?.settings ?? (schema.value ? createDefault(schema.value) as SiteSettings : {})
  value.value = structuredClone(source)
  snapshot.value = JSON.stringify(payload(value.value))
}

fill()

const dirty = computed(() => JSON.stringify(payload(value.value)) !== snapshot.value)
const saving = ref(false)

async function save() {
  if (!dirty.value || saving.value) return
  saving.value = true
  try {
    const saved = await api<ProjectSettingsResponse>(`/projects/${project.value}/settings`, {
      method: 'PUT',
      body: { settings: payload(value.value) } satisfies UpdateSettingsRequest
    })
    stored.value = saved
    fill()
    toast.add({ title: 'Сохранено и применено на сайте', color: 'success' })
  } catch (err) {
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

defineShortcuts({ meta_s: { usingInput: true, handler: save } })

onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Уйти без сохранения?'))
useEventListener(window, 'beforeunload', (event) => {
  if (dirty.value) event.preventDefault()
})
</script>

<template>
  <UDashboardPanel id="site-settings">
    <template #header>
      <UDashboardNavbar title="Общее для сайта">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template v-if="canEdit && schema" #right>
          <span v-if="dirty" class="flex items-center gap-1.5 text-sm text-warning">
            <span class="size-2 rounded-full bg-warning" />
            Не сохранено
          </span>
          <UTooltip text="Применяется на сайте сразу, без публикации страниц">
            <UButton label="Сохранить" icon="i-lucide-save" :disabled="!dirty" :loading="saving" class="cursor-pointer" @click="save" />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Не удалось загрузить настройки"
        :description="apiErrorMessage(error)"
      />
      <UAlert
        v-else-if="!canEdit"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Раздел доступен при доступе ко всему проекту"
        description="Эти настройки общие для всех страниц сайта. Обратитесь к администратору, если нужно что-то изменить."
      />
      <UAlert
        v-else-if="!schema"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Сайт не описал общие настройки"
        description="В манифесте блоков нет settingsSchema. Её публикует сборка сайта (PUT /projects/:project/manifest)."
      />

      <div v-else class="max-w-3xl space-y-4">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          description="Эти данные общие для всех страниц сайта, например пункты меню «Мероприятия». Сохранение применяется сразу, публиковать страницы не нужно."
        />
        <UCard>
          <EditorSchemaForm
            v-model="value"
            :schema="schema"
            :root="schema"
            :project="project"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
