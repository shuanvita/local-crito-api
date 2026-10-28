<script setup lang="ts">
import type { ProjectSummary, RotateCiKeyResponse, UpdateProjectRequest } from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)

useHead({ title: 'Настройки проекта' })

const { data: me } = await useMe()
// Настройки меняет только администратор админки; остальным раздел не показывается, а API всё равно ответит 403.
const canEdit = computed(() => me.value?.isSuperAdmin === true)

// Тот же ключ, что в редакторе и списке страниц: после сохранения они получат свежие данные.
const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)

interface Form {
  name: string
  siteUrl: string
  revalidateUrl: string
  metrikaCounterId: string
}

const form = reactive<Form>({ name: '', siteUrl: '', revalidateUrl: '', metrikaCounterId: '' })
// Секрет назад не возвращается: поле только для нового значения.
const newSecret = ref('')
const errors = ref<Partial<Record<keyof Form, string>>>({})

function fill(source: ProjectSummary) {
  form.name = source.name
  form.siteUrl = source.siteUrl ?? ''
  form.revalidateUrl = source.revalidateUrl ?? ''
  form.metrikaCounterId = source.metrikaCounterId ?? ''
  newSecret.value = ''
  errors.value = {}
}

if (current.value) fill(current.value)

/** Только изменённые поля: пустая строка очищает значение на сервере. */
const changes = computed<UpdateProjectRequest>(() => {
  const source = current.value
  if (!source) return {}
  const body: UpdateProjectRequest = {}
  if (form.name.trim() !== source.name) body.name = form.name.trim()
  if (form.siteUrl.trim() !== (source.siteUrl ?? '')) body.siteUrl = form.siteUrl.trim()
  if (form.revalidateUrl.trim() !== (source.revalidateUrl ?? '')) body.revalidateUrl = form.revalidateUrl.trim()
  if (form.metrikaCounterId.trim() !== (source.metrikaCounterId ?? '')) body.metrikaCounterId = form.metrikaCounterId.trim()
  if (newSecret.value) body.revalidateSecret = newSecret.value
  return body
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

// Те же правила, что на сервере: подсказываем сразу, а окончательно проверяет API.
function validate(): boolean {
  const next: typeof errors.value = {}
  if (!form.name.trim()) next.name = 'Укажите название проекта'
  const site = form.siteUrl.trim()
  if (site && !/^(https:\/\/[^\s/?#@]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/?$/.test(site)) {
    next.siteUrl = 'Адрес вида https://example.com, без пути (http:// только для localhost)'
  }
  const counter = form.metrikaCounterId.trim()
  if (counter && !/^\d{1,12}$/.test(counter)) next.metrikaCounterId = 'Только цифры, не больше 12 знаков'
  errors.value = next
  return Object.keys(next).length === 0
}

const saving = ref(false)

async function save() {
  if (!dirty.value || saving.value || !validate()) return
  saving.value = true
  try {
    const saved = await api<ProjectSummary>(`/projects/${project.value}`, { method: 'PATCH', body: changes.value })
    current.value = saved
    fill(saved)
    await refreshNuxtData(['projects', `project:${project.value}`])
    toast.add({ title: 'Настройки сохранены', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- секрет вебхука ---
const secretConfirm = ref(false)

async function clearSecret() {
  saving.value = true
  try {
    await api(`/projects/${project.value}`, { method: 'PATCH', body: { revalidateSecret: '' } satisfies UpdateProjectRequest })
    toast.add({ title: 'Секрет вебхука удалён', color: 'success' })
    secretConfirm.value = false
  } catch (error) {
    toast.add({ title: 'Не удалось удалить секрет', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- ключ CI ---
const rotateConfirm = ref(false)
const rotating = ref(false)
const newCiKey = ref('')

async function rotateCiKey() {
  rotating.value = true
  try {
    const result = await api<RotateCiKeyResponse>(`/projects/${project.value}/ci-key`, { method: 'POST' })
    newCiKey.value = result.ciKey
    rotateConfirm.value = false
  } catch (error) {
    toast.add({ title: 'Не удалось выпустить ключ', description: apiErrorMessage(error), color: 'error' })
  } finally {
    rotating.value = false
  }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(newCiKey.value)
    toast.add({ title: 'Ключ скопирован', color: 'success' })
  } catch {
    toast.add({ title: 'Не удалось скопировать', description: 'Выделите ключ и скопируйте вручную.', color: 'warning' })
  }
}

const keyModalOpen = computed({
  get: () => !!newCiKey.value,
  set: (value) => { if (!value) newCiKey.value = '' }
})

onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Уйти без сохранения?'))
</script>

<template>
  <UDashboardPanel id="project-settings">
    <template #header>
      <UDashboardNavbar title="Настройки проекта">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template v-if="canEdit && current" #right>
          <UButton label="Сохранить" icon="i-lucide-save" :disabled="!dirty" :loading="saving" class="cursor-pointer" @click="save" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="!canEdit"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="Настройки доступны администратору"
        description="Обратитесь к администратору CMS, если нужно изменить адрес сайта или другие параметры проекта."
      />

      <div v-else-if="current" class="max-w-3xl space-y-4">
        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Основное
            </h2>
          </template>
          <UFormField label="Название проекта" :error="errors.name">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Код проекта" description="Используется в адресах, меняется только при создании проекта.">
            <UInput :model-value="current.slug" disabled icon="i-lucide-lock" class="w-full font-mono" />
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Сайт
            </h2>
          </template>
          <UFormField
            label="Адрес сайта"
            description="По нему в редакторе показывается предпросмотр страницы и ссылка «Открыть на сайте»."
            :error="errors.siteUrl"
          >
            <UInput v-model="form.siteUrl" placeholder="https://nuxt.rucode.net" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Номер счётчика Яндекс Метрики" description="Только цифры. Менеджеры видят его справкой." :error="errors.metrikaCounterId">
            <UInput v-model="form.metrikaCounterId" inputmode="numeric" placeholder="12345678" class="w-full font-mono" />
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Обновление сайта после сохранения
            </h2>
          </template>
          <UFormField label="Адрес вебхука" description="CMS отправляет на него запрос, чтобы сайт сбросил кэш. Пусто: вебхук отключён.">
            <UInput v-model="form.revalidateUrl" placeholder="https://nuxt.rucode.net/api/revalidate" class="w-full font-mono" />
          </UFormField>
          <UFormField
            label="Секрет вебхука"
            description="Хранится зашифрованным и не показывается. Заполните, только чтобы заменить его."
          >
            <div class="flex gap-2">
              <UInput v-model="newSecret" type="password" autocomplete="new-password" placeholder="Новый секрет" class="w-full" />
              <UButton
                label="Удалить секрет"
                color="neutral"
                variant="subtle"
                class="shrink-0 cursor-pointer"
                @click="secretConfirm = true"
              />
            </div>
          </UFormField>
        </UCard>

        <LmsAccessCard :project="project" />

        <UCard>
          <template #header>
            <h2 class="font-medium text-highlighted">
              Ключ CI
            </h2>
          </template>
          <p class="text-sm text-muted">
            Ключ нужен сборке сайта, чтобы публиковать манифест блоков. Старый ключ перестанет работать сразу после выпуска нового.
          </p>
          <UButton
            label="Выпустить новый ключ"
            icon="i-lucide-key-round"
            color="neutral"
            variant="subtle"
            class="mt-3 cursor-pointer"
            @click="rotateConfirm = true"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <ConfirmModal
    v-model:open="secretConfirm"
    title="Удалить секрет вебхука?"
    description="Сайт перестанет принимать запросы CMS на сброс кэша, пока вы не зададите новый секрет."
    confirm-label="Удалить"
    :loading="saving"
    @confirm="clearSecret"
  />
  <ConfirmModal
    v-model:open="rotateConfirm"
    title="Выпустить новый ключ CI?"
    description="Старый ключ сразу перестанет работать: сборку сайта нужно будет обновить новым ключом."
    confirm-label="Выпустить"
    :loading="rotating"
    @confirm="rotateCiKey"
  />
  <UModal
    v-model:open="keyModalOpen"
    title="Новый ключ CI"
    description="Ключ показывается один раз. Скопируйте его и сохраните в настройках сборки сайта."
  >
    <template #body>
      <div class="space-y-3">
        <code class="block break-all rounded-md border border-default bg-elevated p-3 text-sm">{{ newCiKey }}</code>
        <div class="flex justify-end gap-2">
          <UButton label="Скопировать" icon="i-lucide-copy" class="cursor-pointer" @click="copyKey" />
          <UButton label="Готово" color="neutral" variant="subtle" class="cursor-pointer" @click="keyModalOpen = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>
