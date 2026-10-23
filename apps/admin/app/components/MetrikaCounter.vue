<script setup lang="ts">
// Номер счётчика Яндекс Метрики: справка для менеджеров, только чтение. Меняют его разработчики.
const props = defineProps<{ counterId: string | null | undefined }>()

const toast = useToast()

// Номер всегда цифры (проверяет API); повторная проверка не даёт собрать из чужого значения странную ссылку.
const valid = computed(() => !!props.counterId && /^\d{1,12}$/.test(props.counterId))
const href = computed(() => valid.value ? `https://metrika.yandex.ru/dashboard?id=${props.counterId}` : null)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.counterId!)
    toast.add({ title: 'Номер счётчика скопирован' })
  } catch {
    toast.add({ title: 'Не удалось скопировать', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
    <template v-if="valid">
      <span class="text-sm text-muted">Счётчик Яндекс Метрики</span>
      <code class="rounded bg-elevated px-2 py-0.5 font-mono text-sm text-highlighted">{{ counterId }}</code>
      <UTooltip text="Скопировать номер">
        <UButton
          icon="i-lucide-copy"
          size="xs"
          color="neutral"
          variant="ghost"
          aria-label="Скопировать номер счётчика"
          class="cursor-pointer"
          @click="copy"
        />
      </UTooltip>
      <UButton
        label="Открыть в Метрике"
        icon="i-lucide-external-link"
        size="xs"
        color="neutral"
        variant="subtle"
        :to="href!"
        target="_blank"
        rel="noopener noreferrer"
      />
    </template>
    <p v-else class="text-sm text-muted">
      Счётчик Яндекс Метрики не подключён. Его подключают разработчики.
    </p>
  </div>
</template>
