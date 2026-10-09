<script setup lang="ts">
useHead({ title: 'Проекты' })

const { data: projects, status } = await useProjects()

// Единственный проект открываем сразу.
if (projects.value.length === 1) {
  await navigateTo(`/${projects.value[0]!.slug}/pages`, { replace: true })
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
          <UCard class="transition hover:ring-primary">
            <div class="flex items-center justify-between gap-3">
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
          </UCard>
        </NuxtLink>
      </div>
    </template>
  </UDashboardPanel>
</template>
