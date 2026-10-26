<script setup lang="ts">
useHead({ title: 'Проекты' })

const { data: projects, status } = await useProjects()
const { data: me } = await useMe()

// Единственный проект открываем сразу. Администратору главную не пропускаем: с неё он идёт в справочники
// и видит все проекты, а не один.
if (projects.value.length === 1 && me.value && !me.value.isSuperAdmin) {
  await navigateTo(`/${projects.value[0]!.slug}/pages`, { replace: true })
}

// Поиск нужен, только когда проектов несколько.
const query = ref('')
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return projects.value
  return projects.value.filter(project =>
    project.name.toLowerCase().includes(needle) || project.slug.toLowerCase().includes(needle))
})

/** Домен сайта для подписи под названием: `nuxt.rucode.net`. */
function siteHost(origin: string | null): string | null {
  return origin ? new URL(origin).host : null
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Проекты">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template v-if="projects.length" #trailing>
          <UBadge :label="String(projects.length)" color="neutral" variant="subtle" size="sm" />
        </template>
        <template v-if="projects.length > 1" #right>
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="Найти проект"
            aria-label="Найти проект"
            class="w-48 sm:w-64"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl">
        <p class="mb-5 text-sm text-muted">
          Сайты, к которым у вас есть доступ
        </p>

        <div v-if="status === 'pending'" class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          <USkeleton v-for="index in 3" :key="index" class="h-40 rounded-lg" />
        </div>

        <div
          v-else-if="!projects.length"
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-default px-6 py-16 text-center"
        >
          <UIcon name="i-lucide-folder-open" class="size-12 text-dimmed" />
          <p class="font-medium text-highlighted">
            Нет доступных проектов
          </p>
          <p class="max-w-sm text-sm text-muted">
            Доступ к проектам и страницам выдаётся в админке LMS.
          </p>
        </div>

        <div
          v-else-if="!visible.length"
          class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-default px-6 py-16 text-center"
        >
          <UIcon name="i-lucide-search-x" class="size-12 text-dimmed" />
          <p class="font-medium text-highlighted">
            Ничего не найдено
          </p>
          <p class="text-sm text-muted">
            Проекта «{{ query }}» нет среди доступных.
          </p>
        </div>

        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          <!-- Карточка не обёрнута в ссылку: внутри есть свои ссылки. Основная растянута на всю карточку. -->
          <UCard
            v-for="project in visible"
            :key="project.id"
            class="group relative h-full transition hover:shadow-sm hover:ring-primary"
            :ui="{ body: 'flex h-full flex-col gap-4 p-4 sm:p-4' }"
          >
            <div class="flex items-start gap-3">
              <UAvatar
                :text="project.name.charAt(0).toUpperCase()"
                size="lg"
                class="shrink-0 bg-primary/10 font-semibold text-primary"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <NuxtLink
                  :to="`/${project.slug}/pages`"
                  class="block truncate font-medium text-highlighted outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-primary"
                >
                  {{ project.name }}
                </NuxtLink>
                <p class="truncate font-mono text-xs text-muted">
                  {{ siteHost(siteOrigin(project)) ?? project.slug }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1">
                <UBadge
                  :color="project.fullAccess ? 'primary' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :label="project.fullAccess ? 'Весь проект' : 'Отдельные страницы'"
                />
                <UBadge
                  v-if="!project.manifestHash"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  label="Нет манифеста"
                />
              </div>
            </div>

            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-files" class="pointer-events-none size-4 shrink-0" />
                {{ project.fullAccess ? pagesLabel(project.pagesCount) : `${pagesLabel(project.pagesCount)} для редактирования` }}
              </span>
              <span aria-hidden="true">·</span>
              <span v-if="project.lastChangedAt" class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-clock" class="pointer-events-none size-4 shrink-0" />
                изменено {{ formatRelative(project.lastChangedAt) }}
              </span>
              <span v-else class="inline-flex items-center gap-1.5">
                <UIcon name="i-lucide-clock" class="pointer-events-none size-4 shrink-0" />
                Изменений пока нет
              </span>
            </p>

            <!-- Быстрые переходы: кнопки поверх растянутой ссылки (z-10), а промежутки между ними пропускают клик к ней. -->
            <div class="pointer-events-none relative z-10 -mx-1 mt-auto flex flex-wrap items-center gap-1 border-t border-default pt-3 [&>a]:pointer-events-auto">
              <UButton
                :to="`/${project.slug}/pages`"
                icon="i-lucide-files"
                label="Страницы"
                color="neutral"
                variant="ghost"
                size="xs"
              />
              <UButton
                :to="`/${project.slug}/media`"
                icon="i-lucide-image"
                label="Медиатека"
                color="neutral"
                variant="ghost"
                size="xs"
              />
              <UButton
                v-if="project.fullAccess"
                :to="`/${project.slug}/requests`"
                icon="i-lucide-inbox"
                label="Заявки"
                color="neutral"
                variant="ghost"
                size="xs"
              />
              <!-- Только иконка: с подписью строка не помещается в карточку и переносится. -->
              <UButton
                v-if="siteOrigin(project)"
                :to="siteOrigin(project)!"
                target="_blank"
                icon="i-lucide-external-link"
                aria-label="Открыть сайт"
                title="Открыть сайт"
                color="neutral"
                variant="ghost"
                size="xs"
                class="ms-auto"
              />
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
