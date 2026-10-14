<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const slug = useCurrentProjectSlug()
const route = useRoute()
const config = useRuntimeConfig()
// Админка может жить под префиксом (/admin): картинка из public лежит под ним же.
const logoSrc = `${config.app.baseURL.replace(/\/+$/, '')}/logo.png`

const close = () => { open.value = false }

const links = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: 'Проекты',
      icon: 'i-lucide-layout-grid',
      to: '/',
      exact: true,
      onSelect: close
    },
    {
      label: 'Справочники',
      icon: 'i-lucide-library',
      // Раскрыт, пока открыт один из справочников; пункт сам никуда не ведёт.
      defaultOpen: route.path.startsWith('/dictionaries'),
      children: DICTIONARIES.map(dictionary => ({
        label: dictionary.label,
        icon: dictionary.icon,
        to: `/dictionaries/${dictionary.key}`,
        onSelect: close
      }))
    }
  ],
  // Разделы проекта видны, только пока открыт проект.
  ...(slug.value
    ? [[
        {
          label: 'Страницы',
          icon: 'i-lucide-files',
          to: `/${slug.value}/pages`,
          onSelect: close
        },
        {
          label: 'Медиатека',
          icon: 'i-lucide-image',
          to: `/${slug.value}/media`,
          onSelect: close
        }
      ]]
    : [])
])
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
        <!-- Шапка сайдбара фиксированной высоты: в неё помещается только логотип. -->
        <!-- В свёрнутом сайдбаре (64px) широкий логотип не помещается и сжимается: прячем его. -->
        <NuxtLink v-if="!collapsed" to="/" class="block" aria-label="Crito CMS">
          <!-- Светлая плашка: тёмный текст логотипа нечитаем на тёмной теме. -->
          <span class="inline-flex rounded-md bg-white px-2 py-0.5 ring ring-default">
            <img :src="logoSrc" alt="ЦРИТО" class="h-8 w-auto">
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <ProjectSwitcher :collapsed="collapsed" />

        <UNavigationMenu
          v-for="(group, index) in links"
          :key="index"
          :collapsed="collapsed"
          :items="group"
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
