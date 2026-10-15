<script setup lang="ts">
import { VueDraggable } from 'vue-draggable-plus'
import type { PreviewDraft } from '~/utils/site'
import type { BlockManifest, ContentBlock, ContentPageMeta, ManifestBlock, PageDetail, ProjectSummary, UpdatePageRequest } from '@crito/contract'

interface Draft {
  blocks: ContentBlock[]
  meta: ContentPageMeta
  headerConfig: string
  noFooterSpacing: boolean
}

const route = useRoute()
const api = useApi()
const toast = useToast()
const project = computed(() => route.params.project as string)
const id = computed(() => route.params.id as string)
const pageUrl = computed(() => `/projects/${project.value}/pages/${id.value}`)

const { data: page, error } = await useAsyncData(
  () => `page:${id.value}`,
  () => api<PageDetail>(pageUrl.value),
  { watch: [id] }
)
const { data: manifest } = await useAsyncData(
  () => `manifest:${project.value}`,
  () => api<BlockManifest | null>(`/projects/${project.value}/manifest`),
  { watch: [project] }
)

// Тот же ключ, что в списке страниц: ответ берётся из кэша.
const { data: current } = await useAsyncData(
  () => `project:${project.value}`,
  () => api<ProjectSummary>(`/projects/${project.value}`),
  { watch: [project] }
)

useHead({ title: () => page.value?.slug ?? 'Страница' })

// TODO(metrika-demo): ДЕМО-ДАННЫЕ, чтобы показать менеджерам карточку «Аналитика» до подключения счётчика.
// Когда зададим настоящий номер проекту (PATCH /projects/:project, metrikaCounterId), удалить:
// эту константу, computed `metrikaCounter` и проп `demo` здесь и в MetrikaCounter.vue; в шаблоне вернуть
// `current?.metrikaCounterId`. Поиск по `metrika-demo`.
const DEMO_METRIKA_COUNTER_ID = '12345678'
const metrikaCounter = computed(() => {
  const real = current.value?.metrikaCounterId
  if (real) return { id: real, demo: false }
  return page.value?.slug === '/index' ? { id: DEMO_METRIKA_COUNTER_ID, demo: true } : { id: null, demo: false }
})

// Адрес страницы на сайте: `siteUrl` проекта, а если не задан, origin вебхука; главная `/index` открывается по `/`.
const origin = computed(() => siteOrigin(current.value))
const siteUrl = computed(() => page.value ? pageSiteUrl(origin.value, page.value.slug) : null)

// --- настройки страницы ---
const headerConfigs = computed(() => manifest.value?.headerConfigs ?? [])
const headerConfigOptions = computed(() => headerConfigItems(headerConfigs.value, draft.value?.headerConfig ?? ''))
const descriptionLevelValue = computed(() => descriptionLevel(draft.value?.meta.description))
const descriptionHint = computed(() => ({
  empty: `Рекомендуем ${SEO_DESCRIPTION_MIN}–${SEO_DESCRIPTION_MAX} символов: коротко о том, что на странице. Пока пусто.`,
  short: `Коротковато: лучше ${SEO_DESCRIPTION_MIN}–${SEO_DESCRIPTION_MAX} символов.`,
  good: 'Хорошая длина.',
  long: `Длиннее ${SEO_DESCRIPTION_MAX} символов: поисковик обрежет окончание.`
})[descriptionLevelValue.value])

// --- предпросмотр ---
// Справа от формы на широком экране, на узком открывается из шапки поверх страницы.
const PREVIEW_STORAGE_KEY = 'crito:page-preview'
const wide = useMediaQuery('(min-width: 1280px)')
const previewOpen = ref(true)
const previewSlideover = ref(false)
const previewExpanded = ref(false)
const previewReload = ref(0)

onMounted(() => {
  try {
    previewOpen.value = localStorage.getItem(PREVIEW_STORAGE_KEY) !== 'closed'
  } catch {
    // Хранилище недоступно: панель остаётся открытой.
  }
})

function togglePreview() {
  if (!wide.value) {
    previewSlideover.value = true
    return
  }
  previewOpen.value = !previewOpen.value
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, previewOpen.value ? 'open' : 'closed')
  } catch {
    // Только удобство: без хранилища выбор не запоминается.
  }
}

// --- черновик ---
const draft = ref<Draft>()
const baseVersion = ref(0)
const snapshot = ref('')
const selected = ref<string>('page')
const conflict = ref(false)

function cleanMeta(meta: ContentPageMeta): ContentPageMeta | undefined {
  const entries = Object.entries(meta).filter(([, value]) => typeof value === 'string' && value.trim() !== '')
  return entries.length ? Object.fromEntries(entries) as ContentPageMeta : undefined
}

/** Тело запроса сохранения. Используется и для сравнения с исходным состоянием. */
function toPayload(value: Draft) {
  return {
    blocks: pruneEmpty(renumberBlocks(value.blocks)),
    meta: cleanMeta(value.meta),
    headerConfig: value.headerConfig.trim() || undefined,
    noFooterSpacing: value.noFooterSpacing
  }
}

function load(source: PageDetail) {
  draft.value = {
    blocks: [...source.blocks].sort((a, b) => a.order - b.order).map(block => structuredClone(block)),
    meta: { ...source.meta },
    headerConfig: source.headerConfig ?? '',
    noFooterSpacing: source.noFooterSpacing
  }
  baseVersion.value = source.version
  snapshot.value = JSON.stringify(toPayload(draft.value))
  conflict.value = false
  if (selected.value !== 'page' && !draft.value.blocks.some(block => block.id === selected.value)) {
    selected.value = 'page'
  }
}

if (page.value) load(page.value)

// Удалённую страницу нельзя сохранять: сначала её нужно восстановить из корзины.
const trashed = computed(() => !!page.value?.deletedAt)

const dirty = computed(() => !!draft.value && JSON.stringify(toPayload(draft.value)) !== snapshot.value)

const selectedBlockId = computed(() => selected.value === 'page' ? null : selected.value)

// То, что уходит на сайт для предпросмотра: тот же состав, что при сохранении, но без сохранения.
const previewDraft = computed<PreviewDraft | null>(() => draft.value ? toPayload(draft.value) as PreviewDraft : null)

// Клик по блоку в предпросмотре выбирает его в редакторе; блока уже нет в черновике (удалён) выбирать нечего.
function pickBlock(blockId: string) {
  if (!draft.value?.blocks.some(block => block.id === blockId)) return
  selected.value = blockId
  // Список блоков прокручивается сам: выбранная строка должна быть на виду.
  nextTick(() => {
    document.querySelector(`[data-block-item="${CSS.escape(blockId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// --- блоки ---
const definitions = computed(() => new Map((manifest.value?.blocks ?? []).map(block => [block.type, block])))
const selectedBlock = computed(() => draft.value?.blocks.find(block => block.id === selected.value))
const selectedDefinition = computed(() => selectedBlock.value ? definitions.value.get(selectedBlock.value.type) : undefined)

const catalogOpen = ref(false)
const revisionsOpen = ref(false)

function blockTitle(block: ContentBlock) {
  return definitions.value.get(block.type)?.title ?? block.type
}

function addBlock(definition: ManifestBlock) {
  if (!draft.value) return
  const block: ContentBlock = {
    id: newId(),
    type: definition.type,
    order: 0,
    enabled: true,
    schemaVersion: definition.schemaVersion,
    data: definition.schema ? createDefault(definition.schema) : {}
  }
  const index = draft.value.blocks.findIndex(item => item.id === selected.value)
  draft.value.blocks.splice(index === -1 ? draft.value.blocks.length : index + 1, 0, block)
  selected.value = block.id
}

function moveBlock(index: number, delta: number) {
  if (draft.value) draft.value.blocks = moveItem(draft.value.blocks, index, index + delta)
}

function removeBlock(index: number) {
  if (!draft.value) return
  const [removed] = draft.value.blocks.splice(index, 1)
  if (removed?.id === selected.value) selected.value = 'page'
}

// --- сохранение ---
const saving = ref(false)

async function save() {
  if (!draft.value || !dirty.value || saving.value) return
  saving.value = true
  try {
    const saved = await api<PageDetail>(pageUrl.value, {
      method: 'PUT',
      body: { version: baseVersion.value, ...toPayload(draft.value) } satisfies UpdatePageRequest
    })
    load(saved)
    previewReload.value++
    toast.add({ title: `Сохранено, версия ${saved.version}`, color: 'success' })
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) conflict.value = true
    toast.add({ title: 'Не удалось сохранить', description: apiErrorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function reload() {
  try {
    load(await api<PageDetail>(pageUrl.value))
  } catch (err) {
    toast.add({ title: 'Не удалось загрузить страницу', description: apiErrorMessage(err), color: 'error' })
  }
}

defineShortcuts({ meta_s: { usingInput: true, handler: save } })

// --- несохранённые изменения ---
onBeforeRouteLeave(() => !dirty.value || window.confirm('Есть несохранённые изменения. Уйти без сохранения?'))
useEventListener(window, 'beforeunload', (event) => {
  if (dirty.value) event.preventDefault()
})
</script>

<template>
  <UDashboardPanel id="page-editor">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
          <UTooltip text="К списку страниц">
            <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="К списку страниц" :to="`/${project}/pages`" />
          </UTooltip>
        </template>

        <!-- заголовок страницы главный, адрес и ссылка на сайт рядом -->
        <template #title>
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate font-semibold text-highlighted">
              {{ draft?.meta.title || page?.meta?.title || page?.slug || 'Страница' }}
            </span>
            <span v-if="page" class="shrink-0 font-mono text-xs text-muted">{{ page.slug }}</span>
            <UTooltip v-if="siteUrl" text="Открыть на сайте">
              <UButton
                :to="siteUrl"
                target="_blank"
                rel="noopener"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Открыть страницу на сайте"
                class="cursor-pointer hover:text-primary"
              />
            </UTooltip>
          </div>
        </template>

        <template v-if="draft" #right>
          <UBadge :label="`v${baseVersion}`" color="neutral" variant="subtle" size="md" />
          <!-- состояние сохранения видно сразу: либо «Есть изменения», либо «Сохранено» -->
          <span v-if="dirty" class="flex items-center gap-1.5 text-sm text-warning">
            <span class="size-2 rounded-full bg-warning" />
            Есть изменения
          </span>
          <span v-else class="flex items-center gap-1.5 text-sm text-muted">
            <UIcon name="i-lucide-check" />
            Сохранено
          </span>
          <!-- на широком экране предпросмотр уже рядом, поэтому достаточно иконки; на узком нужна подпись -->
          <UTooltip :text="wide && previewOpen ? 'Скрыть предпросмотр' : 'Показать предпросмотр'">
            <UButton
              icon="i-lucide-eye"
              :label="wide ? undefined : 'Предпросмотр'"
              :aria-label="wide && previewOpen ? 'Скрыть предпросмотр' : 'Показать предпросмотр'"
              color="neutral"
              :variant="wide && previewOpen ? 'soft' : 'ghost'"
              :aria-pressed="wide && previewOpen"
              class="cursor-pointer"
              @click="togglePreview"
            />
          </UTooltip>
          <UTooltip text="История версий">
            <UButton
              icon="i-lucide-history"
              :label="wide ? 'История' : undefined"
              color="neutral"
              variant="ghost"
              aria-label="История версий"
              class="cursor-pointer"
              @click="revisionsOpen = true"
            />
          </UTooltip>
          <!-- сохранение = публикация: кнопка называет это прямо, чтобы её не принимали за черновик -->
          <UTooltip :text="dirty ? 'Сохранение сразу публикует страницу на сайте' : 'Нет изменений для публикации'">
            <UButton label="Опубликовать" icon="i-lucide-upload" :disabled="!dirty || trashed" :loading="saving" class="cursor-pointer" @click="save" />
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
        title="Не удалось загрузить страницу"
        :description="apiErrorMessage(error)"
      />

      <template v-else-if="draft">
        <UAlert
          v-if="trashed"
          color="error"
          variant="subtle"
          icon="i-lucide-trash-2"
          title="Страница в корзине"
          description="Её нет на сайте, и сохранить изменения нельзя. Откройте корзину в списке страниц и восстановите страницу."
          class="mb-4"
          :actions="[{ label: 'К списку страниц', color: 'neutral', variant: 'subtle', to: `/${project}/pages` }]"
        />

        <UAlert
          v-if="!manifest"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Манифест блоков не загружен"
          description="Без манифеста нельзя добавлять блоки и сохранять страницу. CI сайта должен опубликовать его (PUT /projects/:project/manifest)."
          class="mb-4"
        />

        <UAlert
          v-if="conflict"
          color="error"
          variant="subtle"
          icon="i-lucide-git-compare"
          title="Страницу изменил другой пользователь"
          description="Ваши изменения не сохранены. Загрузите актуальную версию: несохранённые правки будут потеряны."
          class="mb-4"
          :actions="[{ label: 'Загрузить актуальную версию', color: 'neutral', variant: 'subtle', onClick: reload }]"
        />

        <div
          class="grid items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]"
          :class="previewOpen && 'xl:grid-cols-[20rem_minmax(26rem,1fr)_minmax(24rem,1fr)]'"
        >
          <!-- список блоков: на десктопе закреплён и прокручивается сам, форма справа не уезжает -->
          <aside class="space-y-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:border-r lg:border-default lg:pr-4">
            <!-- пункт навигации, а не поле: без рамки в покое, с акцентной полосой при выборе -->
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
              :class="selected === 'page' ? 'bg-primary/10 text-primary' : 'text-highlighted hover:bg-elevated'"
              :aria-current="selected === 'page' ? 'true' : undefined"
              @click="selected = 'page'"
            >
              <UIcon name="i-lucide-settings-2" :class="selected === 'page' ? 'text-primary' : 'text-muted'" />
              Настройки страницы и SEO
              <UIcon name="i-lucide-chevron-right" class="ml-auto size-4 text-muted" />
            </button>

            <div class="flex items-center justify-between">
              <h2 class="text-sm font-medium text-highlighted">
                Блоки ({{ draft.blocks.length }})
              </h2>
              <UButton
                label="Добавить"
                icon="i-lucide-plus"
                size="xs"
                :disabled="!manifest || trashed"
                @click="catalogOpen = true"
              />
            </div>

            <p v-if="!draft.blocks.length" class="rounded-md border border-dashed border-default p-4 text-center text-sm text-muted">
              На странице пока нет блоков
            </p>

            <!-- одна строка на блок; перемещение и удаление появляются при наведении или фокусе -->
            <!-- перетаскивание за ручку; кнопки «выше/ниже» остаются для клавиатуры -->
            <VueDraggable
              v-model="draft.blocks"
              tag="ul"
              class="space-y-1.5"
              handle=".drag-handle"
              :animation="150"
              :disabled="trashed"
              ghost-class="opacity-40"
            >
              <li
                v-for="(block, index) in draft.blocks"
                :key="block.id"
                :data-block-item="block.id"
                class="group rounded-md border transition-colors"
                :class="selected === block.id ? 'border-yellow-500 bg-yellow-500/10 ring-1 ring-yellow-500' : 'border-default hover:bg-elevated'"
              >
                <div class="flex items-center gap-1 py-1.5 pl-1 pr-2" :class="!block.enabled && 'opacity-60'">
                  <UIcon
                    name="i-lucide-grip-vertical"
                    class="drag-handle size-4 shrink-0 cursor-grab touch-none text-dimmed hover:text-muted active:cursor-grabbing"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="min-w-0 flex-1 cursor-pointer text-left"
                    :aria-current="selected === block.id ? 'true' : undefined"
                    @click="selected = block.id"
                  >
                    <span class="block truncate text-sm font-medium" :class="block.enabled ? 'text-highlighted' : 'text-muted line-through'">
                      {{ blockTitle(block) }}
                    </span>
                    <!-- технический тип нужен разработчику: в покое почти не виден, при наведении и выборе читается -->
                    <span
                      class="block truncate font-mono text-[11px] text-dimmed transition-colors group-hover:text-muted"
                      :class="selected === block.id && 'text-muted'"
                    >{{ block.type }}</span>
                  </button>

                  <div class="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <UButton icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" aria-label="Выше" class="cursor-pointer" :disabled="index === 0" @click="moveBlock(index, -1)" />
                    <UButton icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" aria-label="Ниже" class="cursor-pointer" :disabled="index === draft.blocks.length - 1" @click="moveBlock(index, 1)" />
                    <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" aria-label="Удалить блок" class="cursor-pointer hover:bg-error/10 hover:text-error" @click="removeBlock(index)" />
                  </div>

                  <UTooltip :text="block.enabled ? 'Показывается на сайте. Нажмите, чтобы скрыть' : 'Скрыт на сайте. Нажмите, чтобы показать'">
                    <USwitch
                      :model-value="block.enabled"
                      size="xs"
                      color="neutral"
                      class="cursor-pointer"
                      :aria-label="block.enabled ? 'Скрыть блок' : 'Показать блок'"
                      @update:model-value="block.enabled = $event"
                    />
                  </UTooltip>
                </div>
              </li>
            </VueDraggable>
          </aside>

          <!-- правая панель -->
          <section class="mx-auto w-full min-w-0 max-w-3xl space-y-4">
            <!-- настройки страницы: три секции, чтобы форма не была сплошной простынёй -->
            <template v-if="selected === 'page'">
              <h2 class="text-lg font-semibold text-highlighted">
                Настройки страницы
              </h2>

              <!-- аналитика сверху и всегда раскрыта: менеджер видит счётчик сразу -->
              <UCard>
                <template #header>
                  <h3 class="font-medium text-highlighted">
                    Аналитика
                  </h3>
                </template>
                <MetrikaCounter :counter-id="metrikaCounter.id" :demo="metrikaCounter.demo" />
                <p class="mt-2 text-xs text-muted">
                  Справка: счётчик общий для всего сайта и здесь не редактируется.
                </p>
              </UCard>

              <UCard :ui="{ body: 'space-y-4' }">
                <template #header>
                  <h3 class="font-medium text-highlighted">
                    Основное
                  </h3>
                </template>
                <UFormField label="Адрес страницы" description="Адрес задаётся при создании страницы и потом не меняется.">
                  <UInput :model-value="page?.slug" disabled icon="i-lucide-lock" class="w-full font-mono" />
                </UFormField>
                <UFormField
                  label="Оформление шапки и футера"
                  :description="headerConfigs.length
                    ? 'Как выглядят шапка и футер на этой странице. Если не уверены, оставьте как есть.'
                    : 'Название набора шапки и футера на сайте, например home. Если не уверены, оставьте как есть.'"
                >
                  <!-- список приходит из манифеста сайта; у старых манифестов его нет, тогда ключ вводится текстом -->
                  <USelect
                    v-if="headerConfigs.length"
                    :model-value="toHeaderConfigValue(draft.headerConfig)"
                    :items="headerConfigOptions"
                    class="w-full"
                    @update:model-value="draft.headerConfig = fromHeaderConfigValue($event as string)"
                  />
                  <UInput v-else v-model="draft.headerConfig" placeholder="Как на сайте по умолчанию" class="w-full" />
                </UFormField>
                <div class="space-y-1">
                  <USwitch v-model="draft.noFooterSpacing" label="Прижать последний блок к футеру" />
                  <p class="text-xs text-muted">
                    Убирает пустой отступ между последним блоком и футером. Нужно, если последний блок сам заканчивается фоном.
                  </p>
                </div>
              </UCard>

              <UCard :ui="{ body: 'space-y-4' }">
                <template #header>
                  <h3 class="font-medium text-highlighted">
                    Поиск (SEO)
                  </h3>
                </template>
                <UFormField
                  label="Заголовок страницы"
                  description="Показывается в поиске и во вкладке браузера."
                  :hint="`${(draft.meta.title ?? '').length} / ${SEO_TITLE_MAX}`"
                  :ui="{ hint: (draft.meta.title ?? '').length > SEO_TITLE_MAX ? 'text-warning' : undefined }"
                >
                  <UInput v-model="draft.meta.title" class="w-full" />
                </UFormField>
                <UFormField
                  label="Описание страницы"
                  :description="descriptionHint"
                  :hint="`${(draft.meta.description ?? '').length} / ${SEO_DESCRIPTION_MAX}`"
                  :ui="{ hint: descriptionLevelValue === 'long' ? 'text-warning' : undefined, description: descriptionLevelValue === 'good' ? 'text-success' : undefined }"
                >
                  <UTextarea v-model="draft.meta.description" :rows="3" class="w-full" />
                </UFormField>
              </UCard>

              <UCard :ui="{ body: 'space-y-4' }">
                <template #header>
                  <h3 class="font-medium text-highlighted">
                    Соцсети
                  </h3>
                </template>
                <UFormField label="Заголовок для соцсетей" description="Если оставить пустым, возьмём заголовок страницы из блока «Поиск».">
                  <UInput v-model="draft.meta.ogTitle" :placeholder="draft.meta.title || 'Заголовок страницы'" class="w-full" />
                </UFormField>
                <UFormField label="Описание для соцсетей" description="Если оставить пустым, возьмём описание страницы.">
                  <UTextarea v-model="draft.meta.ogDescription" :placeholder="draft.meta.description" :rows="2" class="w-full" />
                </UFormField>
                <UFormField label="Картинка для соцсетей" description="Рекомендуем 1200×630. Подставится в ссылку, когда страницей делятся.">
                  <EditorFieldImage v-model="draft.meta.ogImage" :project="project" />
                </UFormField>
              </UCard>

              <!-- как это увидят: пересчитывается по мере ввода -->
              <UCard>
                <template #header>
                  <h3 class="font-medium text-highlighted">
                    Как это будет выглядеть
                  </h3>
                </template>
                <EditorSeoPreview :meta="draft.meta" :site-url="siteUrl" :slug="page?.slug ?? ''" :origin="origin" />
              </UCard>

            </template>

            <!-- блок -->
            <template v-else-if="selectedBlock">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    {{ blockTitle(selectedBlock) }}
                  </h2>
                  <p class="font-mono text-xs text-muted">
                    {{ selectedBlock.type }}
                  </p>
                </div>
                <UBadge :label="selectedBlock.enabled ? 'Показывается' : 'Скрыт'" :color="selectedBlock.enabled ? 'success' : 'neutral'" variant="subtle" />
              </div>

              <UFormField label="Якорь" description="Для ссылок вида /#якорь. Латиница, цифры и дефис.">
                <UInput
                  :model-value="selectedBlock.anchor ?? ''"
                  placeholder="about"
                  class="w-full"
                  @update:model-value="selectedBlock.anchor = ($event as string) || undefined"
                />
              </UFormField>

              <UAlert
                v-if="!selectedDefinition"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Неизвестный тип блока"
                description="Такого блока нет в манифесте сайта. Сохранить страницу не получится, пока блок не будет удалён."
              />
              <UAlert
                v-else-if="selectedDefinition.readonly || !selectedDefinition.schema"
                color="info"
                variant="subtle"
                icon="i-lucide-lock"
                title="Содержимое блока не редактируется"
                description="У блока нет схемы данных: его можно только показывать, скрывать и переставлять."
              />
              <EditorSchemaForm
                v-else
                :key="selectedBlock.id"
                v-model="selectedBlock.data"
                :schema="selectedDefinition.schema"
                :root="selectedDefinition.schema"
                :project="project"
              />
            </template>
          </section>

          <!-- предпросмотр: закреплён, прокручивается сама страница в рамке, а не панель -->
          <aside
            v-if="wide && previewOpen"
            class="sticky top-0 h-[calc(100vh-7rem)] min-w-0 border-l border-default pl-6"
          >
            <EditorPagePreview :url="siteUrl" :draft="previewDraft" :selected-block-id="selectedBlockId" :dirty="dirty" :reload-key="previewReload" :trashed="trashed" @pick="pickBlock" expandable @expand="previewExpanded = true" />
          </aside>
        </div>

        <!-- на узком экране предпросмотр открывается поверх страницы -->
        <USlideover
          v-if="!wide"
          v-model:open="previewSlideover"
          title="Предпросмотр"
          description="Так страница выглядит на сайте."
          :ui="{ content: 'max-w-xl', body: 'h-full' }"
        >
          <template #body>
            <EditorPagePreview :url="siteUrl" :draft="previewDraft" :selected-block-id="selectedBlockId" :dirty="dirty" :reload-key="previewReload" :trashed="trashed" @pick="pickBlock" />
          </template>
        </USlideover>

        <!-- крупный предпросмотр: на панели справа сайт сильно уменьшен, здесь его можно прочитать -->
        <UModal
          v-model:open="previewExpanded"
          title="Как страница выглядит на сайте"
          fullscreen
          :ui="{ body: 'h-full' }"
        >
          <template #body>
            <EditorPagePreview :url="siteUrl" :draft="previewDraft" :selected-block-id="selectedBlockId" :dirty="dirty" :reload-key="previewReload" :trashed="trashed" @pick="pickBlock" />
          </template>
        </UModal>

        <EditorBlockCatalogModal
          v-model:open="catalogOpen"
          :blocks="manifest?.blocks ?? []"
          :project="project"
          :site-origin="origin"
          :page-slug="page?.slug ?? ''"
          :used-types="draft.blocks.map(block => block.type)"
          @add="addBlock"
        />
        <EditorRevisionsSlideover
          v-model:open="revisionsOpen"
          :project="project"
          :page-id="id"
          :current-version="baseVersion"
          :locked="dirty"
          @restored="load"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
