<script setup lang="ts">
import type { ApiErrorBody, MediaItem } from '@crito/contract'

const props = defineProps<{
  project: string
  /** Режим выбора: клик по файлу отправляет его наружу вместо показа действий. */
  selectable?: boolean
  /** Показывать только изображения (для полей-картинок). */
  imagesOnly?: boolean
}>()

const emit = defineEmits<{ select: [item: MediaItem] }>()

const toast = useToast()
const media = useMedia(() => props.project)

const search = ref('')
const debouncedSearch = refDebounced(search, 300)
const dragging = ref(false)
const uploading = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const { data: items, status, refresh } = await useAsyncData(
  () => `media:${props.project}:${debouncedSearch.value}`,
  () => media.list(debouncedSearch.value || undefined),
  { default: () => [], watch: [() => props.project, debouncedSearch] }
)

const visible = computed(() =>
  props.imagesOnly ? items.value.filter(item => item.mime.startsWith('image/')) : items.value
)

async function uploadFiles(files: File[]) {
  if (!files.length) return
  uploading.value = true
  try {
    const uploaded = await media.upload(files)
    if (uploaded.length) {
      toast.add({ title: `Загружено файлов: ${uploaded.length}`, color: 'success' })
      await refresh()
      // В режиме выбора единственный загруженный файл сразу выбирается.
      if (props.selectable && uploaded.length === 1) emit('select', uploaded[0]!)
    }
  } finally {
    uploading.value = false
  }
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  uploadFiles([...(input.files ?? [])])
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  uploadFiles([...(event.dataTransfer?.files ?? [])])
}

const toDelete = ref<MediaItem>()
const deleteOpen = computed({
  get: () => !!toDelete.value,
  set: (value) => { if (!value) toDelete.value = undefined }
})
const deleting = ref(false)

async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await media.remove(toDelete.value.id)
    toast.add({ title: 'Файл удалён', color: 'success' })
    toDelete.value = undefined
    await refresh()
  } catch (error) {
    const pages = (error as { data?: ApiErrorBody }).data?.pages
    toast.add({
      title: 'Не удалось удалить файл',
      description: pages?.length ? `Файл используется на страницах: ${pages.join(', ')}` : apiErrorMessage(error),
      color: 'error'
    })
    toDelete.value = undefined
  } finally {
    deleting.value = false
  }
}

async function copyUrl(item: MediaItem) {
  await navigator.clipboard.writeText(item.url)
  toast.add({ title: 'Ссылка скопирована' })
}

const isImage = (item: MediaItem) => item.mime.startsWith('image/')
</script>

<template>
  <div
    class="space-y-4"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск по имени файла" class="min-w-48 flex-1" />
      <UButton label="Загрузить" icon="i-lucide-upload" :loading="uploading" @click="fileInput?.click()" />
      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        :accept="imagesOnly ? 'image/*' : 'image/*,application/pdf'"
        @change="onPick"
      >
    </div>

    <div
      v-if="dragging"
      class="rounded-lg border-2 border-dashed border-primary bg-primary/5 p-8 text-center text-primary"
    >
      Отпустите файлы, чтобы загрузить
    </div>

    <p v-else-if="status === 'pending' && !items.length" class="text-sm text-muted">
      Загрузка…
    </p>

    <p v-else-if="!visible.length" class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted">
      {{ debouncedSearch ? 'Ничего не найдено' : 'Файлов пока нет. Перетащите их сюда или нажмите «Загрузить».' }}
    </p>

    <ul v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <li
        v-for="item in visible"
        :key="item.id"
        class="group relative overflow-hidden rounded-lg border border-default bg-elevated/30"
      >
        <button
          type="button"
          class="block w-full text-left"
          :aria-label="selectable ? `Выбрать ${item.originalName}` : item.originalName"
          @click="selectable ? emit('select', item) : copyUrl(item)"
        >
          <div class="flex aspect-square items-center justify-center bg-elevated">
            <img v-if="isImage(item)" :src="item.url" :alt="item.originalName" class="size-full object-contain" loading="lazy">
            <UIcon v-else name="i-lucide-file-text" class="size-10 text-muted" />
          </div>
          <div class="p-2">
            <p class="truncate text-sm font-medium text-highlighted" :title="item.originalName">
              {{ item.originalName }}
            </p>
            <p class="text-xs text-muted">
              <template v-if="item.width && item.height">
                {{ item.width }}×{{ item.height }} ·
              </template>{{ formatBytes(item.size) }}
            </p>
          </div>
        </button>

        <div v-if="!selectable" class="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="solid" aria-label="Копировать ссылку" @click="copyUrl(item)" />
          <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="solid" aria-label="Удалить" @click="toDelete = item" />
        </div>
      </li>
    </ul>

    <ConfirmModal
      v-model:open="deleteOpen"
      title="Удалить файл?"
      :description="toDelete ? `«${toDelete.originalName}» будет удалён без возможности восстановления. Если файл используется на страницах, удаление не выполнится.` : undefined"
      confirm-label="Удалить"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </div>
</template>
