<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { BlockManifest } from '@crito/contract'

const open = ref(false)
const slug = useCurrentProjectSlug()
const route = useRoute()
const config = useRuntimeConfig()
// Админка может жить под префиксом (/admin): картинка из public лежит под ним же.
const assetBase = config.app.baseURL.replace(/\/+$/, '')
const logoSrc = `${assetBase}/logo.png`
const logoWhiteSrc = `${assetBase}/logo-white.png`

const close = () => { open.value = false }
// Настройки проекта видит только администратор админки (права всё равно проверяет API).
const { data: me } = useMe()
// Заявки содержат персональные данные: пункт нужен только при доступе ко всему проекту.
const { data: projects } = useProjects()
const fullAccess = computed(() => projects.value.find(item => item.slug === slug.value)?.fullAccess === true)

// Раздел общих настроек нужен, только если сайт описал их в манифесте (тот же ключ, что в редакторе страницы).
const api = useApi()
const { data: manifest } = useAsyncData(
  () => `manifest:${slug.value}`,
  () => slug.value ? api<BlockManifest | null>(`/projects/${slug.value}/manifest`) : Promise.resolve(null),
  { watch: [slug] }
)
const hasSiteSettings = computed(() => fullAccess.value && !!manifest.value?.settingsSchema)

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
        },
        ...(fullAccess.value
          ? [{
              label: 'Заявки',
              icon: 'i-lucide-inbox',
              to: `/${slug.value}/requests`,
              onSelect: close
            }]
          : []),
        ...(hasSiteSettings.value
          ? [{
              label: 'Общее для сайта',
              icon: 'i-lucide-panel-top',
              to: `/${slug.value}/site`,
              onSelect: close
            }]
          : []),
        ...(me.value?.isSuperAdmin
          ? [{
              label: 'Настройки',
              icon: 'i-lucide-settings',
              to: `/${slug.value}/settings`,
              onSelect: close
            }]
          : [])
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
          <!-- Тёмный текст логотипа нечитаем на тёмной теме: в ней показываем белый вариант. -->
          <img :src="logoSrc" alt="ЦРИТО" class="h-9 w-auto dark:hidden">
          <img :src="logoWhiteSrc" alt="ЦРИТО" class="hidden h-9 w-auto dark:block">
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
