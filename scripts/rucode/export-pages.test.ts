/**
 * Экспорт локального контента страниц rucode в JSON для импорта в CMS.
 *
 * Файл копируется во фронтенд и запускается его vitest (окружение nuxt) скриптом export.mjs:
 * так используются настоящие реестр блоков, алиасы типов и миграции схем сайта.
 * Сам по себе в репозитории crito-api он не запускается.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildManifest } from '~/app/block-registry/buildManifest'
import { blockDefinitionsWithSchemas } from '~/app/block-registry/withSchemas'
import ru from '~/app/i18n/locales/ru.json'
import { getBlockDefinition, registerBlocks, resetBlockRegistry, resolveBlockType } from '~/shared/api'
import type { ContentBlock, ContentPage, ContentPageMeta } from '~/shared/api'

import { aiChampData } from '~/pages/ai_champ/model/AiChamp.data'
import { aiTestingData } from '~/pages/aitesting/model/AiTesting.data'
import { award2025Data } from '~/pages/award2025/model/Award2025.data'
import { award2026Data } from '~/pages/award2026/model/Award2026.data'
import { capital2024PageData } from '~/pages/capital-2024/model/Capital2024Page.data'
import { champPageData } from '~/pages/champ/model/ChampPage.data'
import { consortiumPageData } from '~/pages/consortium/model/ConsortiumPage.data'
import { final2024PageData } from '~/pages/final-2024/model/Final2024Page.data'
import { homePageData } from '~/pages/home/model/HomePage.data'
import { mtsPageData } from '~/pages/mts/model/MtsPage.data'
import { mwsPageData } from '~/pages/mws/model/MwsPage.data'
import { practicumPageData } from '~/pages/practikum/model/PracticumPage.data'

interface PageSource {
  /** Адрес страницы на сайте: по нему работают алиасы блоков. */
  route: string
  data: ContentPage
  /** `definePageMeta` из src/app/routes/*.vue. */
  headerConfig: string
  noFooterSpacing?: boolean
  meta?: ContentPageMeta
}

const pages: PageSource[] = [
  { route: '/', data: homePageData, headerConfig: 'home' },
  { route: '/ai_champ', data: aiChampData, headerConfig: 'ai_champ' },
  { route: '/aitesting', data: aiTestingData, headerConfig: 'aitesting' },
  { route: '/award2025', data: award2025Data, headerConfig: 'award2025', noFooterSpacing: true },
  { route: '/award2026', data: award2026Data, headerConfig: 'award2026' },
  { route: '/capital-2024', data: capital2024PageData, headerConfig: 'capital2024', noFooterSpacing: true },
  {
    route: '/champ',
    data: champPageData,
    headerConfig: 'champ',
    // SEO чемпионата задан через i18n (meta.champ.*), у остальных страниц своего SEO нет.
    meta: { title: ru.meta.champ.title, description: ru.meta.champ.description },
  },
  { route: '/consortium', data: consortiumPageData, headerConfig: 'consortium' },
  { route: '/final-2024', data: final2024PageData, headerConfig: 'final2024', noFooterSpacing: true },
  { route: '/mts', data: mtsPageData, headerConfig: 'mts' },
  { route: '/mws', data: mwsPageData, headerConfig: 'mws' },
  { route: '/practikum', data: practicumPageData, headerConfig: 'practikum' },
]

type Json = Record<string, unknown>
const isPlain = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const manifest = buildManifest(blockDefinitionsWithSchemas, { project: 'rucode', version: 'export' })
const manifestByType = new Map(manifest.blocks.map((block) => [block.type, block]))

interface Problem {
  page: string
  block?: string
  message: string
}

function convert(source: PageSource, problems: Problem[]) {
  const slug = source.route === '/' ? '/index' : source.route
  const blocks: ContentBlock[] = []
  const usedIds = new Set<string>()

  for (const block of source.data.blocks) {
    const where = { page: slug, block: block.id }
    const type = resolveBlockType(block.type, source.route)
    const definition = type ? getBlockDefinition(type) : undefined
    if (!type || !definition) {
      problems.push({ ...where, message: `неизвестный тип блока "${block.type}"` })
      continue
    }

    let data = (block.data ?? {}) as Json
    const from = block.schemaVersion ?? 1
    if (definition.migrate && from < definition.schemaVersion) data = definition.migrate(data, from)
    // JSON-клон отбрасывает неперечисляемые поля и всё, что не сериализуется. `id` элементам списков
    // намеренно не добавляем: сайт выдаёт их сам (неперечисляемыми), а перечисляемый `id` виджеты,
    // делающие v-bind="item", выводят атрибутом в DOM. Админка выдаёт `id` только новым элементам.
    data = JSON.parse(JSON.stringify(data)) as Json

    if (usedIds.has(block.id)) problems.push({ ...where, message: 'повторяющийся id блока' })
    usedIds.add(block.id)

    if (definition.schema) {
      const result = definition.schema.safeParse(data) as { success: boolean; error?: { issues: unknown[] } }
      if (!result.success) {
        problems.push({ ...where, message: `данные не проходят схему: ${JSON.stringify(result.error?.issues).slice(0, 400)}` })
      }
    }

    blocks.push({
      id: block.id,
      type,
      order: block.order,
      enabled: block.enabled,
      ...(block.anchor ? { anchor: block.anchor } : {}),
      schemaVersion: definition.schemaVersion,
      data,
    })
  }

  return {
    slug,
    blocks: blocks.toSorted((a, b) => a.order - b.order),
    ...(source.meta ? { meta: source.meta } : {}),
    headerConfig: source.headerConfig,
    noFooterSpacing: source.noFooterSpacing ?? false,
  }
}

/** Rich-text поля с HTML-атрибутами, которые TipTap при редактировании в админке может отбросить. */
function auditHtml(value: unknown, path: string, found: string[]) {
  if (typeof value === 'string') {
    if (/<[a-z][^>]*\s(class|style)=/i.test(value)) found.push(path)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => auditHtml(item, `${path}[${index}]`, found))
  } else if (isPlain(value)) {
    for (const [key, child] of Object.entries(value)) auditHtml(child, `${path}.${key}`, found)
  }
}

describe('экспорт контента rucode', () => {
  it('собирает страницы и сохраняет их в JSON', () => {
    resetBlockRegistry()
    registerBlocks(blockDefinitionsWithSchemas)

    const problems: Problem[] = []
    const exported = pages.map((source) => convert(source, problems))

    const htmlWithAttributes: string[] = []
    for (const page of exported) {
      for (const block of page.blocks) auditHtml(block.data, `${page.slug}#${block.id}`, htmlWithAttributes)
    }

    const out = process.env.EXPORT_OUT
    if (out) {
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, JSON.stringify({ project: 'rucode', pages: exported }, null, 2))
    }

    console.log('\n=== Экспорт rucode ===')
    for (const page of exported) {
      const readonly = page.blocks.filter((block) => !manifestByType.get(block.type)?.schema).length
      console.log(`${page.slug.padEnd(16)} блоков: ${String(page.blocks.length).padStart(2)} (только чтение: ${readonly})`)
    }
    console.log(`Проблем: ${problems.length}`)
    for (const problem of problems) console.log(`  ! ${problem.page} ${problem.block ?? ''}: ${problem.message}`)
    console.log(`Поля с class/style в HTML: ${htmlWithAttributes.length}`)
    for (const path of htmlWithAttributes.slice(0, 12)) console.log(`  ~ ${path}`)

    expect(problems).toEqual([])
  })
})
