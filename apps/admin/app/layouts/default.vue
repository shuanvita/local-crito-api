<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const slug = useCurrentProjectSlug()
const route = useRoute()

const links = computed<NavigationMenuItem[][]>(() => [[
  {
    label: 'Проекты',
    icon: 'i-lucide-layout-grid',
    to: '/',
    exact: true,
    onSelect: () => { open.value = false }
  },
  ...(slug.value
    ? [{
        label: 'Страницы',
        icon: 'i-lucide-files',
        to: `/${slug.value}/pages`,
        onSelect: () => { open.value = false }
      }, {
        label: 'Медиатека',
        icon: 'i-lucide-image',
        to: `/${slug.value}/media`,
        onSelect: () => { open.value = false }
      }, {
        label: 'Справочники',
        icon: 'i-lucide-library',
        // Раскрыт, пока открыт один из справочников; пункт сам никуда не ведёт.
        defaultOpen: route.path.startsWith(`/${slug.value}/dictionaries`),
        children: DICTIONARIES.map(dictionary => ({
          label: dictionary.label,
          icon: dictionary.icon,
          to: `/${slug.value}/dictionaries/${dictionary.key}`,
          onSelect: () => { open.value = false }
        }))
      }]
    : [])
]])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <ProjectSwitcher :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <UColorModeButton v-if="collapsed" />
        <div v-else class="flex w-full items-center justify-between">
          <span class="text-sm text-muted">Crito CMS</span>
          <UColorModeButton />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
