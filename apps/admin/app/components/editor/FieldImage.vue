<script setup lang="ts">
defineProps<{ project: string }>()

const model = defineModel<string | undefined>()
const pickerOpen = ref(false)
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <UInput v-model="model" placeholder="Ссылка или файл из медиатеки" class="min-w-0 flex-1" />
      <UButton label="Выбрать" icon="i-lucide-image" color="neutral" variant="subtle" @click="pickerOpen = true" />
      <UButton
        v-if="model"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Очистить"
        @click="model = undefined"
      />
    </div>

    <img
      v-if="model"
      :src="model"
      alt=""
      class="max-h-40 rounded-md border border-default bg-elevated object-contain"
    >

    <MediaPickerModal v-model:open="pickerOpen" :project="project" @select="model = $event.url" />
  </div>
</template>
