<script setup lang="ts">
import type {
  FormSubmissionList,
  TelegramChat,
  TelegramChatCandidate,
  TelegramDiscoverResponse,
  TelegramIntegration,
  TelegramDeliveryResult,
  TelegramTestResponse,
  UpdateTelegramIntegrationRequest
} from '@crito/contract'

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)
const base = computed(() => `/projects/${project.value}/integrations/telegram`)

useHead({ title: 'Интеграция Telegram' })

const { data: me } = await useMe()
// В настройках токен бота: раздел только для администратора админки (API всё равно ответит 403 остальным).
const canEdit = computed(() => me.value?.isSuperAdmin === true)

const { data: current } = await useAsyncData(
  () => `integration:telegram:${project.value}`,
  () => canEdit.value ? api<TelegramIntegration>(base.value) : Promise.resolve(null),
  { watch: [project] }
)

// Ключи форм, которые уже присылал сайт: по ним строится список форм. Не загрузились: вводятся вручную.
const { data: knownForms } = await useAsyncData(
  () => `integration:telegram:forms:${project.value}`,
  async () => {
    if (!canEdit.value) return []
    try {
      return (await api<FormSubmissionList>(`/projects/${project.value}/requests`, { query: { limit: 1 } })).forms
    } catch {
      return []
    }
  },
  { watch: [project], default: () => [] }
)

interface Form {
  enabled: boolean
  chats: TelegramChat[]
  /** Уведомлять обо всех формах (на сервере это пустой список). */
  allForms: boolean
  forms: string[]
  formLabels: Record<string, string>
}

const form = reactive<Form>({ enabled: false, chats: [], allForms: true, forms: [], formLabels: {} })
// Токен назад не возвращается: поле только для нового значения.
const newToken = ref('')
const newChatId = ref('')
const newFormKey = ref('')
const errors = ref<{ token?: string, chat?: string, formKey?: string }>({})
// Пустой список на сервере означает «все формы»: «ни одной формы» тихо превратилось бы в «все», поэтому не даём так выбрать.
const formsError = computed(() => !form.allForms && form.forms.length === 0
  ? 'Отметьте хотя бы одну форму или включите «Уведомлять обо всех формах»'
  : '')

function fill(source: TelegramIntegration) {
  form.enabled = source.enabled
  form.chats = source.chats.map(chat => ({ ...chat }))
  form.allForms = source.forms.length === 0
  form.forms = [...source.forms]
  form.formLabels = { ...source.formLabels }
  newToken.value = ''
  newChatId.value = ''
  newFormKey.value = ''
  errors.value = {}
}

if (current.value) fill(current.value)

/** Формы в списке: присланные сайтом, выбранные и с названием, без повторов. */
const formKeys = computed(() => [...new Set([...knownForms.value, ...form.forms, ...Object.keys(form.formLabels)])].sort())

const cleanLabels = () => Object.fromEntries(
  Object.entries(form.formLabels).map(([key, label]) => [key, label.trim()]).filter(([, label]) => label)
)

// Ключи форм выбирает посетитель сайта (`constructor`, `__proto__`): читаем и пишем названия без обращения по ключу к прототипу.
const labelOf = (key: string) => Object.hasOwn(form.formLabels, key) ? form.formLabels[key] : ''
function setLabel(key: string, value: string) {
  form.formLabels = { ...form.formLabels, ...Object.fromEntries([[key, value]]) }
}

/** Сервер хранит настройки в jsonb и переставляет ключи: сравниваем без учёта порядка. */
const sortedEntries = (value: Record<string, string>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))

/** Только изменённое: сервер не трогает поля, которых нет в теле. */
const changes = computed<UpdateTelegramIntegrationRequest>(() => {
  const source = current.value
  if (!source) return {}
  const body: UpdateTelegramIntegrationRequest = {}
  if (form.enabled !== source.enabled) body.enabled = form.enabled
  if (newToken.value.trim()) body.botToken = newToken.value.trim()
  if (JSON.stringify(form.chats) !== JSON.stringify(source.chats)) body.chats = form.chats
  const forms = form.allForms ? [] : form.forms
  if (JSON.stringify(forms) !== JSON.stringify(source.forms)) body.forms = forms
  const labels = cleanLabels()
  if (sortedEntries(labels) !== sortedEntries(source.formLabels)) body.formLabels = labels
  return body
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

// Те же правила, что на сервере: подсказываем сразу, а окончательно проверяет API.
const CHAT_ID = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/
const FORM_KEY = /^[A-Za-z0-9_-]{1,64}$/
const BOT_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/

function validate(): boolean {
  const next: typeof errors.value = {}
  if (newToken.value.trim() && !BOT_TOKEN.test(newToken.value.trim())) {
    next.token = 'Токен вида 123456:ABC-DEF..., его выдаёт @BotFather'
  }
  if (formsError.value) return false
  errors.value = next
  return Object.keys(next).length === 0
}

function addChat() {
  const id = newChatId.value.trim()
  if (!CHAT_ID.test(id)) {
    errors.value = { ...errors.value, chat: 'Число (у групп с минусом) или @имя_канала' }
    return
  }
  errors.value = { ...errors.value, chat: undefined }
  if (!form.chats.some(chat => chat.id === id)) form.chats.push({ id, title: null })
  newChatId.value = ''
}

function addFormKey() {
  const key = newFormKey.value.trim()
  if (!FORM_KEY.test(key)) {
    errors.value = { ...errors.value, formKey: 'Латиница, цифры, дефис и подчёркивание' }
    return
  }
  errors.value = { ...errors.value, formKey: undefined }
  if (!form.forms.includes(key)) form.forms.push(key)
  newFormKey.value = ''
}

function toggleForm(key: string, checked: boolean | 'indeterminate') {
  form.forms = checked === true ? [...new Set([...form.forms, key])] : form.forms.filter(item => item !== key)
}

const saving = ref(false)

async function save() {
  if (!dirty.value || saving.value || !validate()) return
  saving.value = true
  try {
    const saved = await api<TelegramIntegration>(base.value, { method: 'PUT', body: changes.value })
    current.value = saved
    fill(saved)
    await refreshNuxtData(`integrations:${project.value}`)
    toast.add({ title: 'Настройки сохранены', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- токен ---
const tokenConfirm = ref(false)

async function clearToken() {
  saving.value = true
  try {
    const saved = await api<TelegramIntegration>(base.value, { method: 'PUT', body: { botToken: '' } satisfies UpdateTelegramIntegrationRequest })
    current.value = saved
    fill(saved)
    await refreshNuxtData(`integrations:${project.value}`)
    toast.add({ title: 'Токен удалён, уведомления выключены', color: 'success' })
    tokenConfirm.value = false
  } catch (error) {
    toast.add({ title: 'Не удалось удалить токен', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- проверка отправки ---
const testing = ref(false)
const testResults = ref<TelegramDeliveryResult[]>([])

async function sendTest() {
  testing.value = true
  testResults.value = []
  try {
    testResults.value = (await api<TelegramTestResponse>(`${base.value}/test`, { method: 'POST' })).results
    // Итог доставки записан на сервере: обновляем статус на странице.
    current.value = await api<TelegramIntegration>(base.value)
    await refreshNuxtData(`integrations:${project.value}`)
  } catch (error) {
    toast.add({ title: 'Не удалось отправить', description: apiErrorMessage(error), color: 'error' })
  } finally {
    testing.value = false
  }
}

// --- поиск чатов ---
const discoverOpen = ref(false)
const discovering = ref(false)
const candidates = ref<TelegramChatCandidate[]>([])

async function discover() {
  discovering.value = true
  try {
    candidates.value = (await api<TelegramDiscoverResponse>(`${base.value}/discover-chats`, { method: 'POST' })).chats
    discoverOpen.value = true
  } catch (error) {
    toast.add({ title: 'Не удалось найти чаты', description: apiErrorMessage(error), color: 'error' })
  } finally {
    discovering.value = false
  }
}

const hasChat = (id: string) => form.chats.some(chat => chat.id === id)

function addCandidate(candidate: TelegramChatCandidate) {
  if (!hasChat(candidate.id)) form.chats.push({ id: candidate.id, title: candidate.title })
}

const typeLabels: Record<string, string> = {
  group: 'группа',
  supergroup: 'группа',
  channel: 'канал',
  private: 'личный чат'
}

// --- удаление ---
const removeConfirm = ref(false)

async function removeIntegration() {
  saving.value = true
  try {
    await api(base.value, { method: 'DELETE' })
    await refreshNuxtData(`integrations:${project.value}`)
    removeConfirm.value = false
    // Страница уходит с экрана без вопроса о несохранённом: изменения отброшены вместе с интеграцией.
    if (current.value) fill(current.value)
    toast.add({ title: 'Интеграция удалена', color: 'success' })
    await navigateTo(`/${project.value}/integrations`)
  } catch (error) {
    toast.add({ title: 'Не удалось удалить', description: apiErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => dateFormat.format(new Date(value))
// Сервер стирает ошибку при полностью успешной отправке, а при отказе одного из чатов оставляет её.
const failing = computed(() => Boolean(current.value?.lastErrorAt))

onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Уйти без сохранения?'))
</script>

<template>
  <UDashboardPanel id="integration-telegram">
    <template #header>
      <UDashboardNavbar title="Telegram">
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
        title="Интеграции доступны администратору"
        description="Обратитесь к администратору CMS, если нужно подключить уведомления."
      />

      <div v-else-if="current" class="max-w-3xl space-y-4">
        <NuxtLink :to="`/${project}/integrations`" class="inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted">
          <UIcon name="i-lucide-arrow-left" class="size-4" />
          Все интеграции
        </NuxtLink>

        <UAlert
          v-if="failing"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Последняя доставка не удалась"
          :description="`${current.lastError ?? ''} (${formatDate(current.lastErrorAt!)})`"
        />

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Уведомления о заявках
            </h2>
          </template>
          <p class="text-sm text-muted">
            Когда с формы сайта приходит заявка, бот отправляет сообщение в выбранные чаты. Заявка в любом случае
            сохраняется в разделе «Заявки», даже если Telegram недоступен.
          </p>
          <USwitch v-model="form.enabled" label="Отправлять уведомления" />
          <p v-if="current.lastSuccessAt" class="text-xs text-muted">
            Последняя успешная отправка: {{ formatDate(current.lastSuccessAt) }}
          </p>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Бот
            </h2>
          </template>
          <ol class="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Создайте бота у <span class="font-mono">@BotFather</span> и скопируйте токен.</li>
            <li>Вставьте токен ниже и сохраните.</li>
            <li>Добавьте бота в рабочую группу менеджеров и напишите в ней любое сообщение.</li>
            <li>Нажмите «Найти чаты» в разделе ниже и выберите группу.</li>
          </ol>
          <UFormField
            label="Токен бота"
            :description="current.hasToken
              ? `Сохранён${current.botUsername ? ` (@${current.botUsername})` : ''}, хранится зашифрованным и не показывается. Заполните, только чтобы заменить его.`
              : 'Хранится зашифрованным и после сохранения не показывается.'"
            :error="errors.token"
          >
            <div class="flex gap-2">
              <UInput v-model="newToken" type="password" autocomplete="new-password" placeholder="123456:ABC-DEF..." class="w-full font-mono" />
              <UButton
                v-if="current.hasToken"
                label="Удалить токен"
                color="neutral"
                variant="subtle"
                class="shrink-0 cursor-pointer"
                @click="tokenConfirm = true"
              />
            </div>
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Чаты
            </h2>
          </template>
          <ul v-if="form.chats.length" class="divide-y divide-default rounded-md border border-default">
            <li v-for="(chat, index) in form.chats" :key="chat.id" class="flex items-center justify-between gap-2 px-3 py-2">
              <div class="min-w-0">
                <p v-if="chat.title" class="truncate text-sm font-medium text-highlighted">
                  {{ chat.title }}
                </p>
                <p class="truncate font-mono text-xs text-muted">
                  {{ chat.id }}
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Убрать чат ${chat.title ?? chat.id}`"
                class="cursor-pointer"
                @click="form.chats.splice(index, 1)"
              />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            Чатов пока нет.
          </p>

          <UFormField label="Добавить по идентификатору" description="chat_id группы (с минусом) или @имя публичного канала." :error="errors.chat">
            <div class="flex gap-2">
              <UInput v-model="newChatId" placeholder="-1001234567890" class="w-full font-mono" @keydown.enter.prevent="addChat" />
              <UButton label="Добавить" color="neutral" variant="subtle" class="shrink-0 cursor-pointer" @click="addChat" />
            </div>
          </UFormField>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Найти чаты"
              icon="i-lucide-search"
              color="neutral"
              variant="subtle"
              :loading="discovering"
              :disabled="!current.hasToken || !!newToken"
              class="cursor-pointer"
              @click="discover"
            />
            <span v-if="!current.hasToken || newToken" class="text-xs text-muted">Сначала сохраните токен бота.</span>
          </div>
        </UCard>

        <UCard :ui="{ body: 'space-y-4' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Формы
            </h2>
          </template>
          <USwitch v-model="form.allForms" label="Уведомлять обо всех формах" />
          <p v-if="formsError" class="text-sm text-error">
            {{ formsError }}
          </p>
          <p class="text-sm text-muted">
            Название показывается в заголовке сообщения вместо технического ключа формы.
          </p>
          <ul v-if="formKeys.length" class="divide-y divide-default rounded-md border border-default">
            <li v-for="key in formKeys" :key="key" class="flex flex-wrap items-center gap-3 px-3 py-2">
              <UCheckbox
                v-if="!form.allForms"
                :model-value="form.forms.includes(key)"
                :aria-label="`Уведомлять о форме ${key}`"
                @update:model-value="toggleForm(key, $event)"
              />
              <span class="w-40 shrink-0 truncate font-mono text-sm text-highlighted">{{ key }}</span>
              <UInput
                :model-value="labelOf(key)"
                placeholder="Название в сообщении"
                maxlength="100"
                class="min-w-48 flex-1"
                @update:model-value="setLabel(key, String($event))"
              />
            </li>
          </ul>
          <UFormField label="Добавить форму по ключу" description="Если сайт ещё не присылал заявок с этой формы." :error="errors.formKey">
            <div class="flex gap-2">
              <UInput v-model="newFormKey" placeholder="consortium" class="w-full font-mono" @keydown.enter.prevent="addFormKey" />
              <UButton label="Добавить" color="neutral" variant="subtle" class="shrink-0 cursor-pointer" @click="addFormKey" />
            </div>
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'space-y-3' }">
          <template #header>
            <h2 class="font-medium text-highlighted">
              Проверка
            </h2>
          </template>
          <p class="text-sm text-muted">
            Отправляет тестовое сообщение в сохранённые чаты. Сначала сохраните изменения.
          </p>
          <UButton
            label="Отправить тестовое сообщение"
            icon="i-lucide-send"
            color="neutral"
            variant="subtle"
            :loading="testing"
            :disabled="dirty || !current.hasToken || current.chats.length === 0"
            class="cursor-pointer"
            @click="sendTest"
          />
          <ul v-if="testResults.length" class="space-y-1 text-sm">
            <li v-for="result in testResults" :key="result.chatId" class="flex items-start gap-2">
              <UIcon
                :name="result.ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'"
                :class="result.ok ? 'text-success' : 'text-error'"
                class="mt-0.5 size-4 shrink-0"
              />
              <span class="break-words">
                <span class="font-mono">{{ result.chatId }}</span>:
                {{ result.ok ? 'доставлено' : result.error }}
              </span>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium text-highlighted">
              Удаление
            </h2>
          </template>
          <p class="text-sm text-muted">
            Интеграция будет удалена вместе с токеном и списком чатов.
          </p>
          <UButton
            label="Удалить интеграцию"
            icon="i-lucide-trash-2"
            color="error"
            variant="subtle"
            class="mt-3 cursor-pointer"
            @click="removeConfirm = true"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="discoverOpen" title="Найденные чаты" description="Чаты, где бот состоит или куда ему писали за последние сутки.">
    <template #body>
      <ul v-if="candidates.length" class="divide-y divide-default rounded-md border border-default">
        <li v-for="candidate in candidates" :key="candidate.id" class="flex items-center justify-between gap-2 px-3 py-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ candidate.title }}
            </p>
            <p class="truncate text-xs text-muted">
              <span class="font-mono">{{ candidate.id }}</span> · {{ typeLabels[candidate.type] ?? candidate.type }}
            </p>
          </div>
          <UButton
            :label="hasChat(candidate.id) ? 'Добавлен' : 'Добавить'"
            :disabled="hasChat(candidate.id)"
            color="neutral"
            variant="subtle"
            size="sm"
            class="shrink-0 cursor-pointer"
            @click="addCandidate(candidate)"
          />
        </li>
      </ul>
      <p v-else class="text-sm text-muted">
        Бот пока не видит ни одного чата. Добавьте его в группу, напишите там любое сообщение и повторите поиск.
      </p>
      <div class="mt-4 flex justify-end">
        <UButton label="Готово" color="neutral" variant="subtle" class="cursor-pointer" @click="discoverOpen = false" />
      </div>
    </template>
  </UModal>

  <ConfirmModal
    v-model:open="tokenConfirm"
    title="Удалить токен бота?"
    description="Уведомления будут выключены, пока вы не сохраните новый токен."
    confirm-label="Удалить"
    :loading="saving"
    @confirm="clearToken"
  />
  <ConfirmModal
    v-model:open="removeConfirm"
    title="Удалить интеграцию Telegram?"
    description="Токен бота и список чатов будут удалены, уведомления прекратятся."
    confirm-label="Удалить"
    :loading="saving"
    @confirm="removeIntegration"
  />
</template>
