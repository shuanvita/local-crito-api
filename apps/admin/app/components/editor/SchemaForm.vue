<script setup lang="ts">
import type { JsonSchema } from '@crito/contract'

/**
 * Форма по JSON Schema поля `data` блока. Рекурсивна: объекты и массивы рендерят вложенные SchemaForm.
 * Подсказки `x-field` из манифеста выбирают редактор строки: richtext, image, link.
 */
const props = defineProps<{
  schema: JsonSchema
  root: JsonSchema
  project: string
  label?: string
  required?: boolean
}>()

const model = defineModel<unknown>()

const node = computed(() => resolveSchema(props.schema, props.root))
const type = computed(() => schemaType(node.value))
const field = computed(() => node.value['x-field'])

// --- размеченное объединение (zod discriminatedUnion): выбор варианта и форма выбранного ---
const union = computed(() => unionOf(props.schema, props.root))
const variant = computed(() => union.value ? pickVariant(union.value, model.value) : undefined)
const variantItems = computed(() => (union.value?.variants ?? []).map(item => ({ label: item.title, value: item.value })))

function setVariant(value: string) {
  if (union.value) model.value = switchVariant(union.value, props.root, model.value, value)
}

// --- object ---
const objectValue = computed<Record<string, unknown>>(() =>
  model.value && typeof model.value === 'object' && !Array.isArray(model.value)
    ? model.value as Record<string, unknown>
    : {}
)

/** Поле `id` у элементов списков служебное (itemId): его генерирует админка. Константы (различитель варианта) не правятся. */
const propertyKeys = computed(() => Object.entries(node.value.properties ?? {})
  .filter(([key, property]) => key !== 'id' && property.const === undefined)
  .map(([key]) => key))

function setKey(key: string, value: unknown) {
  const next = { ...objectValue.value }
  if (value === undefined) delete next[key]
  else next[key] = value
  model.value = next
}

function isRequired(key: string) {
  return node.value.required?.includes(key) ?? false
}

// --- array ---
const arrayValue = computed<unknown[]>(() => Array.isArray(model.value) ? model.value : [])
const itemSchema = computed<JsonSchema>(() => node.value.items ?? {})
const itemUnion = computed(() => unionOf(itemSchema.value, props.root))
const itemIsObject = computed(() => !!itemUnion.value || schemaType(resolveSchema(itemSchema.value, props.root)) === 'object')

/** Заголовок элемента списка; у элементов с вариантами спереди название варианта. */
function itemHeader(item: unknown, index: number) {
  const base = itemTitle(item, index)
  const picked = itemUnion.value ? pickVariant(itemUnion.value, item) : undefined
  return picked ? `${picked.title}: ${base}` : base
}

const opened = ref<Record<string, boolean>>({})

function itemKey(item: unknown, index: number) {
  const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined
  return typeof id === 'string' ? id : String(index)
}

function setItem(index: number, value: unknown) {
  model.value = arrayValue.value.map((item, i) => i === index ? value : item)
}

function addItem() {
  const item = createArrayItem(itemSchema.value, props.root)
  model.value = [...arrayValue.value, item]
  opened.value[itemKey(item, arrayValue.value.length)] = true
}

function removeItem(index: number) {
  model.value = arrayValue.value.filter((_, i) => i !== index)
}

function shiftItem(index: number, delta: number) {
  model.value = moveItem(arrayValue.value, index, index + delta)
}

// --- primitives ---
const NONE = '__none__'

const enumItems = computed(() => {
  const values = (node.value.enum ?? []).map(value => ({ label: String(value), value: value as string | number }))
  return props.required ? values : [{ label: 'Не выбрано', value: NONE }, ...values]
})

function setString(value: string | undefined) {
  model.value = !props.required && !value ? undefined : value ?? ''
}

function setEnum(value: string | number) {
  model.value = value === NONE ? undefined : value
}

function setNumber(value: number | undefined) {
  model.value = value ?? (props.required ? 0 : undefined)
}

// --- запасной вариант: неизвестный тип поля правится как JSON ---
const jsonText = ref('')
const jsonError = ref(false)
watch(() => model.value, (value) => {
  if (type.value === undefined || !['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(type.value)) {
    jsonText.value = JSON.stringify(value ?? null, null, 2)
  }
}, { immediate: true })

function commitJson() {
  try {
    model.value = JSON.parse(jsonText.value)
    jsonError.value = false
  } catch {
    jsonError.value = true
  }
}
</script>

<template>
  <!-- объединение с вариантами -->
  <div v-if="union" class="space-y-4">
    <UFormField :label="label ? `${label}: вид` : 'Вид'" :required="required" :description="node.description">
      <USelect
        :model-value="variant?.value"
        :items="variantItems"
        placeholder="Выберите вид"
        class="w-full"
        @update:model-value="setVariant"
      />
    </UFormField>
    <SchemaForm
      v-if="variant"
      :schema="variant.schema"
      :root="root"
      :project="project"
      required
      :model-value="model"
      @update:model-value="model = $event"
    />
  </div>

  <!-- object -->
  <div v-else-if="type === 'object' && node.properties" class="space-y-4">
    <div v-if="label" class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium text-highlighted">
        {{ label }}
      </p>
      <!-- Необязательный блок (например, «Поддержка») можно убрать целиком: пустой блок сайт всё равно покажет -->
      <UButton
        v-if="!required && model !== undefined"
        label="Убрать"
        icon="i-lucide-x"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="model = undefined"
      />
    </div>
    <p v-if="label && node.description" class="-mt-3 text-xs text-muted">
      {{ node.description }}
    </p>
    <div :class="label ? 'space-y-4 border-l-2 border-default pl-4' : 'space-y-4'">
      <SchemaForm
        v-for="key in propertyKeys"
        :key="key"
        :schema="node.properties[key]!"
        :root="root"
        :project="project"
        :label="fieldLabel(key, node.properties[key]!)"
        :required="isRequired(key)"
        :model-value="objectValue[key]"
        @update:model-value="setKey(key, $event)"
      />
    </div>
  </div>

  <!-- array -->
  <div v-else-if="type === 'array'" class="space-y-2">
    <div class="flex items-center justify-between">
      <p v-if="label" class="text-sm font-medium text-highlighted">
        {{ label }} <span class="text-muted">({{ arrayValue.length }})</span>
      </p>
      <UButton label="Добавить" icon="i-lucide-plus" size="xs" color="neutral" variant="subtle" @click="addItem" />
    </div>

    <p v-if="node.description" class="text-xs text-muted">
      {{ node.description }}
    </p>

    <p v-if="!arrayValue.length" class="rounded-md border border-dashed border-default p-3 text-center text-sm text-muted">
      Пока пусто
    </p>

    <ul class="space-y-2">
      <li
        v-for="(item, index) in arrayValue"
        :key="itemKey(item, index)"
        class="rounded-md border border-default bg-elevated/30"
      >
        <div class="flex items-center gap-1 px-2 py-1.5">
          <button
            v-if="itemIsObject"
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
            @click="opened[itemKey(item, index)] = !opened[itemKey(item, index)]"
          >
            <UIcon :name="opened[itemKey(item, index)] ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="shrink-0 text-muted" />
            <span class="truncate">{{ itemHeader(item, index) }}</span>
          </button>
          <div v-else class="min-w-0 flex-1">
            <SchemaForm
              :schema="itemSchema"
              :root="root"
              :project="project"
              required
              :model-value="item"
              @update:model-value="setItem(index, $event)"
            />
          </div>
          <UButton icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" aria-label="Выше" :disabled="index === 0" @click="shiftItem(index, -1)" />
          <UButton icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" aria-label="Ниже" :disabled="index === arrayValue.length - 1" @click="shiftItem(index, 1)" />
          <UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="Удалить элемент" @click="removeItem(index)" />
        </div>

        <div v-if="itemIsObject && opened[itemKey(item, index)]" class="border-t border-default p-3">
          <SchemaForm
            :schema="itemSchema"
            :root="root"
            :project="project"
            required
            :model-value="item"
            @update:model-value="setItem(index, $event)"
          />
        </div>
      </li>
    </ul>
  </div>

  <!-- boolean -->
  <UFormField v-else-if="type === 'boolean'" :description="node.description">
    <USwitch :model-value="model === true" :label="label" @update:model-value="model = $event" />
  </UFormField>

  <!-- enum -->
  <UFormField v-else-if="node.enum?.length" :label="label" :required="required" :description="node.description">
    <USelect
      :model-value="(model as string | number | undefined) ?? (required ? undefined : NONE)"
      :items="enumItems"
      class="w-full"
      @update:model-value="setEnum"
    />
  </UFormField>

  <!-- number -->
  <UFormField v-else-if="type === 'number' || type === 'integer'" :label="label" :required="required" :description="node.description">
    <UInputNumber
      :model-value="typeof model === 'number' ? model : undefined"
      :min="node.minimum"
      :max="node.maximum"
      class="w-full"
      @update:model-value="setNumber"
    />
  </UFormField>

  <!-- string: image -->
  <UFormField v-else-if="type === 'string' && field === 'image'" :label="label" :required="required" :description="node.description">
    <EditorFieldImage
      :project="project"
      :model-value="typeof model === 'string' ? model : undefined"
      @update:model-value="setString"
    />
  </UFormField>

  <!-- string: rich text -->
  <UFormField v-else-if="type === 'string' && field === 'richtext'" :label="label" :required="required" :description="node.description">
    <EditorFieldRichText
      :model-value="typeof model === 'string' ? model : ''"
      @update:model-value="setString"
    />
  </UFormField>

  <!-- string: link / plain -->
  <UFormField v-else-if="type === 'string'" :label="label" :required="required" :description="node.description">
    <UInput
      :model-value="typeof model === 'string' ? model : ''"
      :icon="field === 'link' ? 'i-lucide-link' : undefined"
      :placeholder="field === 'link' ? 'https://… или /страница' : undefined"
      :maxlength="node.maxLength"
      class="w-full"
      @update:model-value="setString($event as string)"
    />
  </UFormField>

  <!-- неизвестный тип: JSON -->
  <UFormField
    v-else
    :label="label"
    :error="jsonError ? 'Некорректный JSON' : undefined"
    description="Тип поля не поддерживается формой, значение правится как JSON."
  >
    <UTextarea v-model="jsonText" :rows="4" class="w-full font-mono" @blur="commitJson" />
  </UFormField>
</template>
