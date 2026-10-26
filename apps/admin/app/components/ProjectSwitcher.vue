<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { data: projects } = await useProjects()
const slug = useCurrentProjectSlug()

const current = computed(() => projects.value.find(project => project.slug === slug.value))

const items = computed<DropdownMenuItem[][]>(() => [
  projects.value.map(project => ({
    label: project.name,
    icon: 'i-lucide-globe',
    to: `/${project.slug}/pages`
  })),
  [{ label: 'Все проекты', icon: 'i-lucide-layout-grid', to: '/' }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :label="collapsed ? undefined : (current?.name ?? 'Все проекты')"
      :icon="current ? 'i-lucide-globe' : 'i-lucide-layout-grid'"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :class="[!collapsed && 'py-2']"
      :ui="{ trailingIcon: 'text-dimmed' }"
    />
  </UDropdownMenu>
</template>
