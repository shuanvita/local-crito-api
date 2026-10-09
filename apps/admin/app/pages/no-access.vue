<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Нет доступа' })
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <div class="max-w-md text-center">
      <UIcon name="i-lucide-lock" class="mb-4 size-10 text-muted" />
      <h1 class="text-xl font-semibold text-highlighted">
        Нет доступа
      </h1>
      <p class="mt-2 text-muted">
        Эта админка открывается из админки LMS. Войдите в LMS и перейдите в раздел
        управления сайтами.
      </p>
    </div>
  </div>
</template>
