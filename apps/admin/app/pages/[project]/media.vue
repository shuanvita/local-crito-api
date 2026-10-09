<script setup lang="ts">
const route = useRoute()
const project = computed(() => route.params.project as string)

useHead({ title: 'Медиатека' })
</script>

<template>
  <UDashboardPanel id="media">
    <template #header>
      <UDashboardNavbar title="Медиатека">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <MediaLibrary :project="project" />
    </template>
  </UDashboardPanel>
</template>
