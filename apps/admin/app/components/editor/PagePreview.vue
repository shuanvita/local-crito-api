<script setup lang="ts">
import type { PreviewDraft } from '~/utils/site'

const props = defineProps<{
  /** Адрес страницы на сайте; null, если адрес сайта в проекте не задан. */
  url: string | null
  /** Есть несохранённые изменения: на сайте их ещё нет. */
  dirty: boolean
  /** Увеличивается после сохранения: превью перезагружается. */
  reloadKey: number
  /** Страница в корзине: на сайте её нет. */
  trashed?: boolean
  /** Показывать кнопку «Развернуть» (в самой развёрнутой версии она не нужна). */
  expandable?: boolean
  /** Текущее состояние редактора: уходит на сайт в режиме «С моими правками», ничего не сохраняя. */
  draft?: PreviewDraft | null
  /** Выбранный в редакторе блок: сайт подсвечивает его и прокручивает к нему; null: ничего не выбрано. */
  selectedBlockId?: string | null
}>()
const emit = defineEmits<{
  expand: []
  /** Клик по блоку в предпросмотре: редактор выбирает этот блок. */
  pick: [blockId: string]
}>()

type Device = 'desktop' | 'mobile'
const device = ref<Device>('desktop')
const loading = ref(true)
const frameKey = ref(0)

// «С моими правками»: сайт получает черновик по postMessage (это может быть несохранённая правка, черновик или открытая версия из истории: на сайте их нет до публикации).
type Mode = 'draft' | 'published'
const mode = ref<Mode>('draft')
const frame = ref<HTMLIFrameElement>()
const frameSrc = computed(() => previewFrameUrl(props.url, mode.value === 'draft'))
const frameOrigin = computed(() => {
  try {
    return props.url ? new URL(props.url).origin : null
  } catch {
    return null
  }
})
// Сайт без поддержки предпросмотра не отвечает «готово»: тогда честно показываем опубликованную версию.
const bridgeReady = ref(false)

// Подсветка выбранного блока на сайте работает в обоих режимах: в «Опубликованной» сайт только подсвечивает и отдаёт клики.
function sendSelection() {
  if (!bridgeReady.value || !frameOrigin.value) return
  frame.value?.contentWindow?.postMessage(selectMessage(props.selectedBlockId ?? null), frameOrigin.value)
}

function sendDraft() {
  if (mode.value !== 'draft' || !props.draft || !frameOrigin.value) return
  frame.value?.contentWindow?.postMessage(draftMessage(props.draft), frameOrigin.value)
  // После нового черновика блоки на сайте перерисованы: выделение ставим заново.
  nextTick(sendSelection)
}
const sendDraftDebounced = useDebounceFn(sendDraft, 300)
watch(() => props.selectedBlockId, sendSelection)

useEventListener(window, 'message', (event: MessageEvent) => {
  if (event.origin !== frameOrigin.value || event.source !== frame.value?.contentWindow) return
  const picked = pickedBlockId(event.data)
  if (picked) {
    emit('pick', picked)
    return
  }
  if (!isReadyMessage(event.data)) return
  bridgeReady.value = true
  sendDraft()
  sendSelection()
})
watch(() => props.draft, sendDraftDebounced, { deep: true })
watch(mode, () => {
  bridgeReady.value = false
  loading.value = true
  frameKey.value++
})

// Ширина «экрана» в пикселях; панель масштабирует его под свою ширину, чтобы не было горизонтальной прокрутки.
const WIDTHS: Record<Device, number> = { desktop: 1280, mobile: 390 }
const viewport = ref<HTMLElement>()
const { width: panelWidth } = useElementSize(viewport)
const scale = computed(() => {
  if (!panelWidth.value) return 1
  return Math.min(1, panelWidth.value / WIDTHS[device.value])
})

function refresh() {
  loading.value = true
  frameKey.value++
}

// Сайт отдаёт страницу через серверный кэш, который сбрасывает вебхук CMS в фоне: небольшая пауза,
// чтобы после сохранения не показать старую версию.
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => props.reloadKey, () => {
  clearTimeout(timer)
  loading.value = true
  timer = setTimeout(refresh, 1500)
})
onBeforeUnmount(() => clearTimeout(timer))
watch(() => props.url, () => {
  loading.value = true
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-highlighted">
        Как страница выглядит на сайте
      </h2>
      <div class="flex items-center gap-1">
        <UFieldGroup size="xs">
          <UButton
            icon="i-lucide-monitor"
            label="Компьютер"
            color="neutral"
            :variant="device === 'desktop' ? 'solid' : 'outline'"
            class="cursor-pointer"
            @click="device = 'desktop'"
          />
          <UButton
            icon="i-lucide-smartphone"
            label="Телефон"
            color="neutral"
            :variant="device === 'mobile' ? 'solid' : 'outline'"
            class="cursor-pointer"
            @click="device = 'mobile'"
          />
        </UFieldGroup>
        <UTooltip v-if="expandable" text="Развернуть на весь экран">
          <UButton
            icon="i-lucide-maximize-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Развернуть предпросмотр"
            :disabled="!url"
            class="cursor-pointer"
            @click="emit('expand')"
          />
        </UTooltip>
        <UTooltip text="Обновить">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Обновить предпросмотр"
            :disabled="!url"
            class="cursor-pointer"
            @click="refresh"
          />
        </UTooltip>
        <UTooltip text="Открыть на сайте в новой вкладке">
          <UButton
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Открыть страницу на сайте"
            :to="url ?? undefined"
            target="_blank"
            rel="noopener"
            :disabled="!url"
            class="cursor-pointer"
          />
        </UTooltip>
      </div>
    </div>

    <UAlert
      v-if="trashed"
      color="neutral"
      variant="subtle"
      icon="i-lucide-trash-2"
      title="Страницы нет на сайте"
      description="Она в корзине. Восстановите её, чтобы увидеть на сайте."
    />
    <UAlert
      v-else-if="!url"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Адрес сайта не задан"
      description="Предпросмотр появится, когда разработчик укажет адрес сайта в настройках проекта (siteUrl)."
    />

    <template v-else>
      <UFieldGroup size="xs" class="self-start">
        <UButton
          label="С моими правками"
          color="neutral"
          :variant="mode === 'draft' ? 'solid' : 'outline'"
          class="cursor-pointer"
          @click="mode = 'draft'"
        />
        <UButton
          label="Опубликованная"
          color="neutral"
          :variant="mode === 'published' ? 'solid' : 'outline'"
          class="cursor-pointer"
          @click="mode = 'published'"
        />
      </UFieldGroup>
      <!-- Состояние простыми словами: что именно сейчас в окне. -->
      <p
        class="flex items-start gap-2 rounded-md px-3 py-2 text-xs"
        :class="mode === 'published' && dirty ? 'bg-warning/10 text-warning' : 'bg-elevated text-toned'"
      >
        <UIcon :name="mode === 'published' && dirty ? 'i-lucide-info' : 'i-lucide-check'" class="mt-0.5 size-4 shrink-0" />
        <span v-if="mode === 'published' && dirty">Показана опубликованная версия, без ваших правок. Переключитесь на «С моими правками», чтобы увидеть их до публикации.</span>
        <span v-else-if="mode === 'published'">Показана опубликованная версия страницы, как её видят посетители.</span>
        <span v-else-if="!bridgeReady && !loading">Сайт не ответил на предпросмотр правок, показана опубликованная версия. Обновите страницу или обратитесь к разработчику.</span>
        <span v-else-if="dirty">Показаны ваши правки, они ещё не опубликованы. Нажмите «Опубликовать», и их увидят посетители.</span>
        <span v-else>Правок нет: показано то, что опубликовано.</span>
      </p>

      <div ref="viewport" class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-default bg-elevated">
        <div
          v-if="loading"
          class="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-default/70 text-sm text-muted"
        >
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Загружаем страницу…
        </div>
        <!-- Рамка нужной ширины, уменьшенная целиком: на сайте срабатывают те же адаптивные правила, что у посетителя. -->
        <div
          class="mx-auto origin-top-left"
          :style="{ width: `${WIDTHS[device]}px`, height: `${100 / scale}%`, transform: `scale(${scale})` }"
        >
          <iframe
            ref="frame"
            :key="frameKey"
            :src="frameSrc ?? undefined"
            title="Предпросмотр страницы"
            class="size-full bg-white"
            referrerpolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
            @load="loading = false"
          />
        </div>
      </div>
      <p class="text-xs text-toned">
        Нажмите на блок, чтобы выбрать его в редакторе. Если картинка не появилась, нажмите «Обновить».
      </p>
    </template>
  </div>
</template>
