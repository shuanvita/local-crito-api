<script setup lang="ts">
import type { ContentPageMeta } from '@crito/contract'

const props = defineProps<{
  meta: ContentPageMeta
  /** Адрес страницы на сайте; null, если адрес сайта не задан. */
  siteUrl: string | null
  slug: string
  /** Origin сайта: относительные пути картинок берутся с него. */
  origin: string | null
}>()

const preview = computed(() => buildSeoPreview(props.meta, {
  siteUrl: props.siteUrl,
  slug: props.slug,
  resolveImage: src => resolvePreview(src, props.origin)
}))
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <!-- поиск -->
    <div class="space-y-2">
      <p class="text-xs font-medium text-muted">
        В поиске
      </p>
      <div class="rounded-md border border-default bg-default p-3">
        <p class="truncate text-xs text-muted">
          {{ preview.search.host || 'сайт' }}<span v-if="preview.search.path"> › {{ preview.search.path.replace(/^\//, '').split('/').join(' › ') }}</span>
        </p>
        <p class="mt-0.5 text-base leading-snug text-primary">
          {{ preview.search.title }}
        </p>
        <p v-if="preview.search.description" class="mt-0.5 text-sm text-toned">
          {{ preview.search.description }}
        </p>
        <p v-else class="mt-0.5 text-sm italic text-muted">
          Описания нет: поисковик возьмёт случайный фрагмент страницы.
        </p>
      </div>
    </div>

    <!-- соцсети -->
    <div class="space-y-2">
      <p class="text-xs font-medium text-muted">
        В соцсетях
      </p>
      <div class="overflow-hidden rounded-md border border-default bg-default">
        <div class="flex aspect-[1.91/1] items-center justify-center bg-elevated">
          <img v-if="preview.social.image" :src="preview.social.image" alt="" class="size-full object-cover">
          <div v-else class="flex flex-col items-center gap-1 text-xs text-muted">
            <UIcon name="i-lucide-image-off" class="size-5" />
            Картинка не задана
          </div>
        </div>
        <div class="space-y-0.5 p-3">
          <p v-if="preview.social.host" class="truncate text-xs uppercase text-muted">
            {{ preview.social.host }}
          </p>
          <p class="truncate text-sm font-medium text-highlighted">
            {{ preview.social.title }}
          </p>
          <p v-if="preview.social.description" class="line-clamp-2 text-xs text-toned">
            {{ preview.social.description }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
