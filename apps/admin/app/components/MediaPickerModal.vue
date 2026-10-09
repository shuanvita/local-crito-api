<script setup lang="ts">
import type { MediaItem } from '@crito/contract'

defineProps<{ project: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [item: MediaItem] }>()

function onSelect(item: MediaItem) {
  emit('select', item)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Выбор изображения"
    description="Выберите файл из медиатеки или загрузите новый."
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <MediaLibrary v-if="open" :project="project" selectable images-only @select="onSelect" />
    </template>
  </UModal>
</template>
