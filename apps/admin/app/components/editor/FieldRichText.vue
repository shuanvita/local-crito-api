<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'

const model = defineModel<string>({ default: '' })

const toolbar: EditorToolbarItem[][] = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline' },
    { kind: 'mark', mark: 'strike', icon: 'i-lucide-strikethrough' }
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote' }
  ],
  [{ kind: 'link', icon: 'i-lucide-link' }],
  [
    { kind: 'undo', icon: 'i-lucide-undo' },
    { kind: 'redo', icon: 'i-lucide-redo' }
  ]
]
</script>

<template>
  <UEditor
    v-slot="{ editor }"
    v-model="model"
    content-type="html"
    :starter-kit="{ link: { openOnClick: false, HTMLAttributes: { target: null, rel: null } } }"
    :extensions="[PreserveClass, StyledSpan]"
    class="min-h-32 w-full rounded-md border border-default"
    :ui="{ base: 'p-3' }"
  >
    <UEditorToolbar :editor="editor" :items="toolbar" class="border-b border-default px-2 py-1" />
  </UEditor>
</template>
