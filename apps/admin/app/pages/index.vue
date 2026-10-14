<script setup lang="ts">
useHead({ title: 'Проекты' })

const { data: projects, status } = await useProjects()
const { data: me } = await useMe()

// Единственный проект открываем сразу. Администратору главную не пропускаем: с неё он идёт в справочники
// и видит все проекты, а не один.
if (projects.value.length === 1 && me.value && !me.value.isSuperAdmin) {
  await navigateTo(`/${projects.value[0]!.slug}/pages`, { replace: true })
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const formatDate = (value: string) => dateFormat.format(new Date(value))

/** «1 страница», «2 страницы», «5 страниц». */
function pagesLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return `${count} страница`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} страницы`
  return `${count} страниц`
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Проекты">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="status === 'pending'" class="text-muted">
        Загрузка…
      </div>

      <UAlert
        v-else-if="!projects.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="Нет доступных проектов"
        description="Доступ к проектам и страницам выдаётся в админке LMS."
      />

      <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="project in projects"
          :key="project.id"
          :to="`/${project.slug}/pages`"
          class="block"
        >
          <UCard class="h-full transition hover:ring-primary">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">
                  {{ project.name }}
                </p>
                <p class="truncate text-sm text-muted">
                  {{ project.slug }}
                </p>
              </div>
              <UBadge
                v-if="!project.manifestHash"
                color="warning"
                variant="subtle"
                label="Нет манифеста"
              />
            </div>

            <dl class="mt-4 space-y-1 text-sm">
              <div class="flex items-center gap-2 text-muted">
                <UIcon name="i-lucide-files" class="size-4 shrink-0" />
                <dt class="sr-only">
                  {{ project.fullAccess ? 'Страницы' : 'Доступные страницы' }}
                </dt>
                <dd>
                  {{ project.fullAccess ? pagesLabel(project.pagesCount) : `${pagesLabel(project.pagesCount)} для редактирования` }}
                </dd>
              </div>
              <div class="flex items-center gap-2 text-muted">
                <UIcon name="i-lucide-clock" class="size-4 shrink-0" />
                <dt class="sr-only">
                  Последнее изменение
                </dt>
                <dd>
                  {{ project.lastChangedAt ? formatDate(project.lastChangedAt) : 'Изменений пока нет' }}
                </dd>
              </div>
            </dl>

            <div class="mt-3">
              <UBadge
                :color="project.fullAccess ? 'primary' : 'neutral'"
                variant="subtle"
                :label="project.fullAccess ? 'Весь проект' : 'Отдельные страницы'"
              />
            </div>
          </UCard>
        </NuxtLink>
      </div>
    </template>
  </UDashboardPanel>
</template>
