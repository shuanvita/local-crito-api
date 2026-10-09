<script setup lang="ts">
import type { BlockManifest, ContentBlock, ContentPageMeta, ManifestBlock, PageDetail, UpdatePageRequest } from '@crito/contract'

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

useHead({ title: () => page.value?.slug ?? 'Страница' })

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
      <UDashboardNavbar :title="page?.slug ?? 'Страница'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="К списку страниц" :to="`/${project}/pages`" />
        </template>

        <template v-if="draft" #right>
          <UBadge :label="`Версия ${baseVersion}`" color="neutral" variant="subtle" />
          <UBadge v-if="dirty" label="Есть изменения" color="warning" variant="subtle" />
          <UButton label="История" icon="i-lucide-history" color="neutral" variant="ghost" @click="revisionsOpen = true" />
          <UButton label="Сохранить" icon="i-lucide-save" :disabled="!dirty || trashed" :loading="saving" @click="save" />
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

        <div class="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <!-- список блоков -->
          <aside class="space-y-3">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition"
              :class="selected === 'page' ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated/50'"
              @click="selected = 'page'"
            >
              <UIcon name="i-lucide-settings-2" class="text-muted" />
              Настройки страницы и SEO
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

            <ul class="space-y-2">
              <li
                v-for="(block, index) in draft.blocks"
                :key="block.id"
                class="rounded-md border transition"
                :class="selected === block.id ? 'border-primary bg-primary/5' : 'border-default'"
              >
                <div class="flex items-center gap-1 p-2">
                  <button type="button" class="min-w-0 flex-1 text-left" @click="selected = block.id">
                    <span class="block truncate text-sm font-medium" :class="block.enabled ? 'text-highlighted' : 'text-muted line-through'">
                      {{ blockTitle(block) }}
                    </span>
                    <span class="block truncate font-mono text-xs text-muted">{{ block.type }}</span>
                  </button>
                  <USwitch
                    :model-value="block.enabled"
                    size="sm"
                    :aria-label="block.enabled ? 'Скрыть блок' : 'Показать блок'"
                    @update:model-value="block.enabled = $event"
                  />
                </div>
                <div class="flex items-center justify-between border-t border-default px-1 py-0.5">
                  <div class="flex">
                    <UButton icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" aria-label="Выше" :disabled="index === 0" @click="moveBlock(index, -1)" />
                    <UButton icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" aria-label="Ниже" :disabled="index === draft.blocks.length - 1" @click="moveBlock(index, 1)" />
                  </div>
                  <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="Удалить блок" @click="removeBlock(index)" />
                </div>
              </li>
            </ul>
          </aside>

          <!-- правая панель -->
          <section class="min-w-0 space-y-4">
            <!-- настройки страницы -->
            <template v-if="selected === 'page'">
              <h2 class="text-lg font-semibold text-highlighted">
                Настройки страницы
              </h2>

              <UFormField label="Адрес" description="Адрес меняется только при создании страницы.">
                <UInput :model-value="page?.slug" disabled class="w-full" />
              </UFormField>
              <UFormField label="Ключ шапки и футера" description="Конфигурация шапки и футера на сайте (необязательно).">
                <UInput v-model="draft.headerConfig" class="w-full" />
              </UFormField>
              <USwitch v-model="draft.noFooterSpacing" label="Без отступа перед футером" />

              <h3 class="pt-2 font-medium text-highlighted">
                SEO
              </h3>
              <UFormField label="Заголовок (title)">
                <UInput v-model="draft.meta.title" class="w-full" />
              </UFormField>
              <UFormField label="Описание (description)">
                <UTextarea v-model="draft.meta.description" :rows="3" class="w-full" />
              </UFormField>
              <UFormField label="Заголовок для соцсетей (og:title)">
                <UInput v-model="draft.meta.ogTitle" class="w-full" />
              </UFormField>
              <UFormField label="Описание для соцсетей (og:description)">
                <UTextarea v-model="draft.meta.ogDescription" :rows="2" class="w-full" />
              </UFormField>
              <UFormField label="Картинка для соцсетей (og:image)">
                <EditorFieldImage v-model="draft.meta.ogImage" :project="project" />
              </UFormField>
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
        </div>

        <EditorBlockCatalogModal v-model:open="catalogOpen" :blocks="manifest?.blocks ?? []" @add="addBlock" />
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
