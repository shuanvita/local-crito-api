<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const slug = useCurrentProjectSlug()
const route = useRoute()
const config = useRuntimeConfig()
// Админка может жить под префиксом (/admin): картинка из public лежит под ним же.
const assetBase = config.app.baseURL.replace(/\/+$/, '')
const logoSrc = `${assetBase}/logo.png`
const logoWhiteSrc = `${assetBase}/logo-white.png`

const lmsUrl = 'https://edu.mipt.ru/adm'

const close = () => { open.value = false }

// Настройки проекта видит только администратор админки (права всё равно проверяет API).
const { data: me } = useMe()
// Пароли в CMS не меняются (это дело LMS). Вошедшему через LMS выход тоже не нужен: остаётся справка о том, кто вошёл.
const userMenu = computed(() => me.value?.viaLms
  ? [[{ label: me.value.email, type: 'label' as const }, { label: 'Вход через LMS', icon: 'i-lucide-badge-check', disabled: true }]]
  : [[{ label: 'Выйти', icon: 'i-lucide-log-out', onSelect: () => logout() }]])
// Заявки содержат персональные данные: пункт нужен только при доступе ко всему проекту или по роли из LMS.
const { data: projects } = useProjects()
const requestsAccess = computed(() => projects.value.find(item => item.slug === slug.value)?.requestsAccess === true)

const links = computed<NavigationMenuItem[][]>(() => [
  [
    // Список проектов открывает переключатель сверху (пункт «Все проекты») и логотип.
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
    },
    ...(me.value?.isSuperAdmin
      ? [{
          label: 'Доступы',
          icon: 'i-lucide-users',
          to: '/users',
          onSelect: close
        }]
      : [])
  ],
  // Разделы проекта видны, только пока открыт проект.
  ...(slug.value
    ? [[
        // Подпись отделяет меню проекта от общего; в свёрнутом сайдбаре её не видно.
        {
          label: projects.value.find(item => item.slug === slug.value)?.name ?? slug.value,
          type: 'label' as const
        },
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
        ...(requestsAccess.value
          ? [{
              label: 'Заявки',
              icon: 'i-lucide-inbox',
              to: `/${slug.value}/requests`,
              onSelect: close
            }]
          : []),
        ...(me.value?.isSuperAdmin
          ? [{
              label: 'Интеграции',
              icon: 'i-lucide-plug',
              to: `/${slug.value}/integrations`,
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
      class="bg-elevated"
      :ui="{ header: 'lg:border-b lg:border-default', footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <!-- Шапка сайдбара фиксированной высоты: в неё помещается только логотип. -->
        <!-- В свёрнутом сайдбаре (64px) широкий логотип не помещается и сжимается: прячем его. -->
        <NuxtLink v-if="!collapsed" to="/" class="block px-1 py-1" aria-label="Crito CMS">
          <!-- Тёмный текст логотипа нечитаем на тёмной теме: в ней показываем белый вариант. -->
          <img :src="logoSrc" alt="ЦРИТО" class="h-12 w-auto dark:hidden">
          <img :src="logoWhiteSrc" alt="ЦРИТО" class="hidden h-12 w-auto dark:block">
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
        <div class="flex w-full flex-col gap-2">
          <!-- Внешний адрес: открываем в этой же вкладке, как возврат на предыдущий сервис. -->
          <UTooltip v-if="collapsed" text="Вернуться в LMS">
            <UButton
              :to="lmsUrl"
              target="_self"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="solid"
              square
              class="self-center"
              aria-label="Вернуться в LMS"
            />
          </UTooltip>
          <UButton
            v-else
            :to="lmsUrl"
            target="_self"
            icon="i-lucide-arrow-left"
            label="Вернуться в LMS"
            color="neutral"
            variant="solid"
            block
          />
          <UColorModeButton v-if="collapsed" class="self-center" />
          <div v-else class="flex w-full items-center justify-between gap-2">
            <UDropdownMenu :items="userMenu" :content="{ side: 'top', align: 'start' }" class="min-w-0">
              <UButton color="neutral" variant="ghost" class="min-w-0 flex-1 justify-start gap-2 px-1" aria-label="Меню пользователя">
                <UAvatar
                  :text="(me?.name ?? me?.email ?? 'C').charAt(0).toUpperCase()"
                  size="sm"
                  class="shrink-0"
                  aria-hidden="true"
                />
                <div class="min-w-0 text-left leading-tight">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ me?.name ?? me?.email ?? 'Crito CMS' }}
                  </p>
                  <p v-if="me" class="truncate text-xs text-muted">
                    {{ me.isSuperAdmin ? 'Администратор' : 'Редактор' }}
                  </p>
                </div>
              </UButton>
            </UDropdownMenu>
            <UColorModeButton />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
