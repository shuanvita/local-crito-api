<script setup lang="ts">
import { ru } from '@nuxt/ui/locale'

const colorMode = useColorMode()
const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  htmlAttrs: { lang: 'ru' },
  titleTemplate: title => title ? `${title} · Crito CMS` : 'Crito CMS'
})
</script>

<template>
  <UApp :locale="ru">
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
