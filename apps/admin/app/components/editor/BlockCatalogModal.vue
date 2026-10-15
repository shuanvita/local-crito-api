<script setup lang="ts">
import type { ManifestBlock } from '@crito/contract'
import { resolvePreview } from '~/utils/site'
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  groupEntries,
  matchesQuery,
  pushRecent,
  suggestedForPage,
  toEntry
} from '~/utils/blockCatalog'
import type { CatalogEntry, CatalogTab } from '~/utils/blockCatalog'

const props = defineProps<{
  blocks: ManifestBlock[]
  /** Slug проекта: недавние блоки хранятся отдельно по проектам. */
  project: string
  /** Адрес редактируемой страницы: по нему подбираются блоки вкладки «Для этой страницы». */
  pageSlug: string
  /** Типы блоков, уже стоящих на странице. */
  usedTypes: string[]
  /** Адрес сайта проекта: относительные пути превью блоков берутся с него. */
  siteOrigin?: string | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ add: [block: ManifestBlock] }>()

const search = ref('')
const tab = ref<CatalogTab>('all')
const activeGroup = ref<string | null>(null)
const recent = ref<string[]>([])
const justAdded = ref<string | null>(null)

const storageKey = computed(() => `crito:recent-blocks:${props.project}`)

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey.value) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(value: string[]) {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(value))
  } catch {
    // Хранилище недоступно: недавние живут только до закрытия окна.
  }
}

const entries = computed(() => props.blocks.map(toEntry))
const suggestedTypes = computed(() =>
  new Set(suggestedForPage(props.blocks, props.pageSlug, props.usedTypes).map(block => block.type))
)

const tabEntries = computed<Record<CatalogTab, CatalogEntry[]>>(() => ({
  page: entries.value.filter(entry => suggestedTypes.value.has(entry.block.type)),
  all: entries.value.filter(entry => !entry.library),
  library: entries.value.filter(entry => entry.library)
}))

const tabItems = computed(() => {
  const items: { label: string, value: CatalogTab, icon: string }[] = [
    { label: `Для этой страницы (${tabEntries.value.page.length})`, value: 'page', icon: 'i-lucide-file-check' },
    { label: `Все блоки сайта (${tabEntries.value.all.length})`, value: 'all', icon: 'i-lucide-layers' }
  ]
  // Библиотека нужна не каждому сайту: вкладка появляется, только если сайт пометил блоки origin: 'library'.
  if (tabEntries.value.library.length) {
    items.push({ label: `Библиотека UI (${tabEntries.value.library.length})`, value: 'library', icon: 'i-lucide-component' })
  }
  return items
})

watch(open, (isOpen) => {
  if (!isOpen) return
  recent.value = readRecent()
  search.value = ''
  activeGroup.value = null
  justAdded.value = null
  tab.value = tabEntries.value.page.length ? 'page' : 'all'
})

// Смена вкладки: выбранная группа может отсутствовать в новой.
watch(tab, () => {
  activeGroup.value = null
})

const visible = computed(() => tabEntries.value[tab.value].filter(entry => matchesQuery(entry, search.value)))
const groups = computed(() => groupEntries(visible.value))
const shownGroups = computed(() =>
  activeGroup.value ? groups.value.filter(group => group.name === activeGroup.value) : groups.value
)

const recentEntries = computed(() => {
  if (search.value.trim() || activeGroup.value) return []
  const byType = new Map(tabEntries.value[tab.value].map(entry => [entry.block.type, entry]))
  return recent.value.flatMap((type) => {
    const entry = byType.get(type)
    return entry ? [entry] : []
  })
})

// Окно «Посмотреть»: крупный пример блока и пояснение, чтобы выбрать осознанно.
const detail = ref<CatalogEntry | null>(null)
const detailOpen = computed({
  get: () => detail.value !== null,
  set: (value) => {
    if (!value) detail.value = null
  }
})
const previewOf = (entry: CatalogEntry) => resolvePreview(entry.block.preview, props.siteOrigin ?? null)
// Если картинка не загрузилась (сайт недоступен, файла нет), показываем заглушку, а не битое изображение.
const failed = ref(new Set<string>())
const previewFor = (entry: CatalogEntry) => failed.value.has(entry.block.type) ? null : previewOf(entry)
function markFailed(entry: CatalogEntry) {
  failed.value = new Set(failed.value).add(entry.block.type)
}

function addFromDetail(event: MouseEvent) {
  const entry = detail.value
  if (!entry) return
  detail.value = null
  pick(entry, event)
}

function pick(entry: CatalogEntry, event: MouseEvent) {
  emit('add', entry.block)
  recent.value = pushRecent(recent.value, entry.block.type)
  writeRecent(recent.value)
  if (event.shiftKey) {
    // Shift+клик: окно остаётся, чтобы добавить несколько блоков подряд.
    justAdded.value = entry.block.type
    return
  }
  open.value = false
}

const EMPTY_HINT: Record<CatalogTab, string> = {
  page: 'Для этой страницы нет подходящих блоков. Откройте «Все блоки сайта».',
  all: 'Ничего не найдено',
  library: 'В библиотеке ничего не найдено'
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Добавить блок"
    description="Выберите тип блока. Shift + клик добавляет блок и оставляет окно открытым."
    :ui="{ content: 'max-w-5xl' }"
  >
    <template #body>
      <div class="flex h-[70vh] flex-col gap-3">
        <UTabs v-model="tab" :items="tabItems" :content="false" size="sm" class="shrink-0" />
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Поиск по названию, событию или описанию"
          class="w-full shrink-0"
          autofocus
        >
          <template v-if="search" #trailing>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="link"
              aria-label="Очистить поиск"
              class="cursor-pointer"
              @click="search = ''"
            />
          </template>
        </UInput>

        <div class="flex min-h-0 flex-1 gap-4">
          <nav v-if="groups.length > 1" class="hidden w-48 shrink-0 overflow-y-auto sm:block" aria-label="Группы блоков">
            <ul class="space-y-0.5">
              <li>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-elevated"
                  :class="activeGroup === null ? 'bg-elevated font-medium text-highlighted' : 'text-muted'"
                  @click="activeGroup = null"
                >
                  <span>Все</span>
                  <span class="text-xs">{{ visible.length }}</span>
                </button>
              </li>
              <li v-for="group in groups" :key="group.name">
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-elevated"
                  :class="activeGroup === group.name ? 'bg-elevated font-medium text-highlighted' : 'text-muted'"
                  @click="activeGroup = group.name"
                >
                  <span class="truncate">{{ group.name }}</span>
                  <span class="text-xs">{{ group.entries.length }}</span>
                </button>
              </li>
            </ul>
          </nav>

          <div class="min-w-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <p v-if="!shownGroups.length" class="py-10 text-center text-sm text-muted">
              {{ search.trim() ? 'Ничего не найдено' : EMPTY_HINT[tab] }}
            </p>

            <section v-if="recentEntries.length">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Недавно использованные
              </h3>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="entry in recentEntries"
                  :key="entry.block.type"
                  :label="entry.title"
                  :title="entry.block.type"
                  icon="i-lucide-history"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  class="cursor-pointer"
                  @click="pick(entry, $event)"
                />
              </div>
            </section>

            <section v-for="group in shownGroups" :key="group.name">
              <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {{ group.name }}
              </h3>
              <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <li v-for="entry in group.entries" :key="entry.block.type" class="relative">
                  <!-- «Посмотреть» рядом с карточкой, а не внутри неё: кнопка в кнопке недопустима -->
                  <UButton
                    label="Посмотреть"
                    icon="i-lucide-eye"
                    size="xs"
                    color="neutral"
                    variant="subtle"
                    class="absolute right-5 top-5 z-10 cursor-pointer shadow-sm"
                    :aria-label="`Посмотреть, как выглядит блок ${entry.title}`"
                    @click="detail = entry"
                  />
                  <button
                    type="button"
                    :title="entry.block.type"
                    class="flex h-full w-full cursor-pointer flex-col gap-2 rounded-md border p-3 text-left transition hover:border-primary hover:bg-elevated/50"
                    :class="justAdded === entry.block.type ? 'border-primary bg-primary/5' : 'border-default'"
                    @click="pick(entry, $event)"
                  >
                    <img
                      v-if="previewFor(entry)"
                      :src="previewFor(entry)!"
                      :alt="`Превью блока ${entry.title}`"
                      loading="lazy"
                      class="h-24 w-full rounded border border-default object-cover object-top"
                      @error="markFailed(entry)"
                    >
                    <!-- без картинки: плитка с иконкой категории, чтобы карточки были одной высоты -->
                    <span
                      v-else
                      class="flex h-24 w-full items-center justify-center rounded border border-dashed border-default bg-elevated/40 text-muted"
                    >
                      <UIcon :name="CATEGORY_ICONS[entry.block.category] ?? 'i-lucide-box'" class="size-8" />
                    </span>
                    <span class="flex items-start gap-2">
                      <UIcon
                        :name="CATEGORY_ICONS[entry.block.category] ?? 'i-lucide-box'"
                        class="mt-0.5 size-4 shrink-0 text-muted"
                      />
                      <span class="min-w-0">
                        <span class="block text-sm font-medium text-highlighted">{{ entry.title }}</span>
                        <span v-if="entry.block.description" class="mt-0.5 line-clamp-2 block text-xs text-muted">
                          {{ entry.block.description }}
                        </span>
                      </span>
                    </span>
                    <span v-if="entry.block.readonly || justAdded === entry.block.type" class="mt-auto flex gap-1">
                      <UBadge
                        v-if="entry.block.readonly"
                        label="без редактирования"
                        title="Блок без схемы: можно только включать, скрывать и переставлять"
                        color="neutral"
                        variant="subtle"
                        size="sm"
                      />
                      <UBadge v-if="justAdded === entry.block.type" label="добавлен" color="primary" variant="subtle" size="sm" />
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="detailOpen"
    :title="detail?.title ?? ''"
    :description="detail ? `${CATEGORY_LABELS[detail.block.category] ?? detail.block.category} · ${detail.group}` : ''"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div v-if="detail" class="space-y-4">
        <img
          v-if="previewFor(detail)"
          :src="previewFor(detail)!"
          :alt="`Так выглядит блок ${detail.title}`"
          class="max-h-[60vh] w-full rounded-md border border-default object-contain object-top"
          @error="markFailed(detail)"
        >
        <div
          v-else
          class="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-default bg-elevated/40 text-center text-muted"
        >
          <UIcon :name="CATEGORY_ICONS[detail.block.category] ?? 'i-lucide-box'" class="size-10" />
          <p class="text-sm">
            Картинки для этого блока пока нет.
          </p>
          <p class="px-6 text-xs">
            Добавьте блок на страницу и откройте «Предпросмотр»: там будет видно, как он выглядит на сайте.
          </p>
        </div>

        <p v-if="detail.block.description" class="text-sm text-default">
          {{ detail.block.description }}
        </p>
        <p v-if="detail.block.readonly" class="text-xs text-muted">
          Содержимое этого блока не редактируется: его можно только показывать, скрывать и переставлять.
        </p>

        <div class="flex justify-end gap-2">
          <UButton label="Закрыть" color="neutral" variant="ghost" class="cursor-pointer" @click="detail = null" />
          <UButton label="Добавить на страницу" icon="i-lucide-plus" class="cursor-pointer" @click="addFromDetail" />
        </div>
      </div>
    </template>
  </UModal>
</template>
