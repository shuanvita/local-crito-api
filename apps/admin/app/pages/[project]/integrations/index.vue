<script setup lang="ts">
import type { IntegrationSummary, IntegrationType } from '@crito/contract'

const route = useRoute()
const api = useApi()
const project = computed(() => route.params.project as string)

useHead({ title: 'Интеграции' })

const { data: me } = await useMe()
// В интеграциях лежат токены: раздел только для администратора админки (API всё равно ответит 403 остальным).
const canEdit = computed(() => me.value?.isSuperAdmin === true)

const { data: integrations, status } = await useAsyncData(
  () => `integrations:${project.value}`,
  () => canEdit.value ? api<IntegrationSummary[]>(`/projects/${project.value}/integrations`) : Promise.resolve([]),
  { watch: [project], default: () => [] }
)

const icons: Record<IntegrationType, string> = {
  telegram: 'i-lucide-send'
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

/** Сервер стирает ошибку при следующей полностью успешной отправке, а при частичном отказе (один чат не принял) оставляет её. */
const hasError = (item: IntegrationSummary) => Boolean(item.lastErrorAt)

function badge(item: IntegrationSummary) {
  if (item.enabled && hasError(item)) return { label: 'Ошибка доставки', color: 'error' as const }
  if (item.enabled) return { label: 'Включено', color: 'success' as const }
  if (item.configured) return { label: 'Выключено', color: 'neutral' as const }
  return { label: 'Не настроено', color: 'neutral' as const }
}
</script>

<template>
  <UDashboardPanel id="integrations">
    <template #header>
      <UDashboardNavbar title="Интеграции">
        <template #leading>
          <UDashboardSidebarCollapse />
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
        description="Обратитесь к администратору CMS, если нужно подключить уведомления или другие сервисы."
      />

      <div v-else class="grid max-w-4xl gap-4 sm:grid-cols-2">
        <UCard
          v-for="item in integrations"
          :key="item.type"
          :ui="{ body: 'space-y-3' }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <UIcon :name="icons[item.type]" class="size-6 shrink-0 text-primary" />
              <h2 class="truncate font-medium text-highlighted">
                {{ item.title }}
              </h2>
            </div>
            <UBadge :label="badge(item).label" :color="badge(item).color" variant="subtle" class="shrink-0" />
          </div>
          <p class="text-sm text-muted">
            {{ item.description }}
          </p>
          <p v-if="item.enabled && hasError(item)" class="break-words text-sm text-error">
            {{ item.lastError }}
          </p>
          <p v-else-if="item.lastSuccessAt" class="text-xs text-muted">
            Последняя доставка: {{ dateFormat.format(new Date(item.lastSuccessAt)) }}
          </p>
          <UButton
            :to="`/${project}/integrations/${item.type}`"
            :label="item.configured ? 'Настройки' : 'Настроить'"
            icon="i-lucide-settings-2"
            color="neutral"
            variant="subtle"
            class="cursor-pointer"
          />
        </UCard>

        <p v-if="status === 'success' && integrations.length === 0" class="text-sm text-muted">
          Интеграций пока нет.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
