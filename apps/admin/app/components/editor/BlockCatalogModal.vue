<script setup lang="ts">
import type { ManifestBlock } from '@crito/contract'

const props = defineProps<{ blocks: ManifestBlock[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ add: [block: ManifestBlock] }>()

const CATEGORY_LABELS: Record<string, string> = {
  hero: 'Главный экран',
  content: 'Контент',
  media: 'Медиа',
  people: 'Люди',
  cards: 'Карточки',
  faq: 'Вопросы и ответы',
  cta: 'Призыв к действию',
  partners: 'Партнёры',
  contacts: 'Контакты'
}

const search = ref('')

const groups = computed(() => {
  const query = search.value.trim().toLowerCase()
  const matching = props.blocks.filter(block =>
    !query || block.title.toLowerCase().includes(query) || block.type.toLowerCase().includes(query)
  )
  const byCategory = new Map<string, ManifestBlock[]>()
  for (const block of matching) {
    byCategory.set(block.category, [...(byCategory.get(block.category) ?? []), block])
  }
  return [...byCategory.entries()].map(([category, blocks]) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    blocks
  }))
})

function pick(block: ManifestBlock) {
  emit('add', block)
  open.value = false
  search.value = ''
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Добавить блок"
    description="Выберите тип блока из каталога сайта."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск по названию" class="w-full" autofocus />

        <p v-if="!groups.length" class="text-center text-sm text-muted">
          Ничего не найдено
        </p>

        <section v-for="group in groups" :key="group.category">
          <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            {{ group.label }}
          </h3>
          <ul class="grid gap-2 sm:grid-cols-2">
            <li v-for="block in group.blocks" :key="block.type">
              <button
                type="button"
                class="w-full rounded-md border border-default p-3 text-left transition hover:border-primary hover:bg-elevated/50"
                @click="pick(block)"
              >
                <span class="block text-sm font-medium text-highlighted">{{ block.title }}</span>
                <span class="block font-mono text-xs text-muted">{{ block.type }}</span>
                <UBadge v-if="block.readonly" label="только включение/порядок" color="neutral" variant="subtle" size="sm" class="mt-1" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </UModal>
</template>
