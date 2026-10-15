import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service.js';
import type { BlockManifest, ContentBlock, JsonSchema } from '@crito/contract';
import { sanitizeBlockData } from './rich-text.js';

/** Блок страницы в запросе на сохранение: формат контракта. */
export type PageBlockInput = ContentBlock;

const MAX_REPORTED_ERRORS = 20;

@Injectable()
export class ManifestService {
  /** Разобранный манифест и скомпилированные валидаторы по проекту; сбрасываются при смене хеша. */
  private readonly cache = new Map<
    string,
    { hash: string; manifest: BlockManifest; validators: Map<string, ValidateFunction> }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Манифест хранится текстом, чтобы сохранить порядок полей схемы (JSONB его переставляет). */
  async get(slug: string): Promise<BlockManifest | null> {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      select: { manifest: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return project.manifest ? (JSON.parse(project.manifest) as BlockManifest) : null;
  }

  /** Сохраняет манифест, присланный CI при деплое фронтенда. */
  async set(slug: string, manifest: BlockManifest) {
    if (manifest.project !== slug) {
      throw new BadRequestException(`Манифест относится к проекту "${manifest.project}", а не "${slug}"`);
    }
    this.assertHeaderConfigs(manifest.headerConfigs);
    const types = new Set<string>();
    const ajv = this.createAjv();
    for (const block of manifest.blocks) {
      if (types.has(block.type)) throw new BadRequestException(`Дублируется type блока: ${block.type}`);
      types.add(block.type);
      this.assertCatalogFields(block);
      if (block.schema) {
        try {
          ajv.compile(block.schema);
        } catch (error) {
          throw new BadRequestException(
            `Невалидная JSON Schema у блока ${block.type}: ${(error as Error).message}`,
          );
        }
      }
    }

    const text = JSON.stringify(manifest);
    const hash = createHash('sha256').update(text).digest('hex');
    await this.prisma.project.update({
      where: { slug },
      data: { manifest: text, manifestHash: hash },
    });
    this.cache.delete(slug);
    return { project: slug, version: manifest.version, hash, blocks: manifest.blocks.length };
  }

  /**
   * Проверяет блоки страницы по манифесту проекта: известный `type`, уникальные `id`,
   * данные соответствуют JSON Schema. Блоки без схемы (`readonly`) не проверяются по данным.
   */
  async validateBlocks(slug: string, blocks: PageBlockInput[]) {
    const entry = await this.loadEntry(slug);
    const ajv = this.createAjv();
    const definitions = new Map(entry.manifest.blocks.map((block) => [block.type, block]));
    const errors: string[] = [];
    const ids = new Set<string>();

    blocks.forEach((block, index) => {
      const where = `blocks[${index}] (${block.type})`;
      if (ids.has(block.id)) errors.push(`${where}: повторяется id "${block.id}"`);
      ids.add(block.id);

      const definition = definitions.get(block.type);
      if (!definition) {
        errors.push(`${where}: неизвестный type`);
        return;
      }
      if (!definition.schema) return;

      let validate = entry.validators.get(block.type);
      if (!validate) {
        validate = ajv.compile(definition.schema);
        entry.validators.set(block.type, validate);
      }
      if (!validate(block.data)) {
        for (const error of validate.errors ?? []) {
          errors.push(`${where}: data${error.instancePath} ${error.message ?? 'невалидно'}`);
        }
      }
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Блоки не прошли проверку по схеме',
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
      });
    }
  }

  /**
   * Очищает rich-text и проверяет адреса в блоках по их схемам. Вызывается после `validateBlocks`.
   * Возвращает новые блоки: данные из запроса не изменяются.
   */
  async sanitizeBlocks<T extends PageBlockInput>(slug: string, blocks: T[]): Promise<T[]> {
    const entry = await this.loadEntry(slug);
    const definitions = new Map(entry.manifest.blocks.map((block) => [block.type, block]));
    const errors: string[] = [];

    const result = blocks.map((block, index) => {
      const schema = definitions.get(block.type)?.schema as JsonSchema | undefined;
      if (!schema) return block;
      const sanitized = sanitizeBlockData(block.data, schema);
      for (const path of sanitized.errors) {
        errors.push(`blocks[${index}] (${block.type}): ${path}: недопустимый адрес (разрешены http, https, mailto, tel и относительные)`);
      }
      return { ...block, data: sanitized.data };
    });

    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Недопустимые адреса в полях', errors: errors.slice(0, MAX_REPORTED_ERRORS) });
    }
    return result;
  }

  /** Типы блоков без схемы: их содержимое админка не редактирует и сервер не может проверить. */
  async readonlyTypes(slug: string): Promise<Set<string>> {
    const entry = await this.loadEntry(slug);
    return new Set(entry.manifest.blocks.filter((block) => !block.schema).map((block) => block.type));
  }

  /** Разобранный манифест из кэша; текст читается из БД только при смене хеша. */
  private async loadEntry(slug: string) {
    const head = await this.prisma.project.findUnique({
      where: { slug },
      select: { manifestHash: true },
    });
    if (!head) throw new NotFoundException('Проект не найден');
    if (!head.manifestHash) throw new ConflictException('Манифест блоков проекта ещё не загружен');

    const cached = this.cache.get(slug);
    if (cached?.hash === head.manifestHash) return cached;

    const manifest = await this.get(slug);
    if (!manifest) throw new ConflictException('Манифест блоков проекта ещё не загружен');
    const entry = { hash: head.manifestHash, manifest, validators: new Map<string, ValidateFunction>() };
    this.cache.set(slug, entry);
    return entry;
  }

  /** Поля каталога блоков приходят из CI без DTO: проверяем вручную, чтобы мусор не попал в БД. */
  private assertCatalogFields(block: BlockManifest['blocks'][number]) {
    const fail = (message: string): never => {
      throw new BadRequestException(`Блок ${block.type}: ${message}`);
    };
    if (block.origin !== undefined && block.origin !== 'library' && block.origin !== 'project') {
      fail('origin должен быть "library" или "project"');
    }
    for (const field of ['group', 'description', 'preview'] as const) {
      if (block[field] !== undefined && typeof block[field] !== 'string') fail(`${field} должен быть строкой`);
    }
    if (
      block.pages !== undefined &&
      (!Array.isArray(block.pages) || block.pages.some((mask) => typeof mask !== 'string'))
    ) {
      fail('pages должен быть массивом строк');
    }
  }

  /**
   * Список вариантов шапки приходит из CI без DTO. Ключ попадает в `headerConfig` страниц и на сайт,
   * поэтому он непустой, без пробелов по краям и уникальный.
   */
  private assertHeaderConfigs(value: unknown) {
    if (value === undefined) return;
    const fail = (message: string): never => {
      throw new BadRequestException(`headerConfigs: ${message}`);
    };
    if (!Array.isArray(value)) fail('должен быть массивом');
    const keys = new Set<string>();
    for (const [index, item] of (value as unknown[]).entries()) {
      const entry = item as Record<string, unknown> | null;
      if (!entry || typeof entry !== 'object') fail(`[${index}] должен быть объектом`);
      const { key, title, description } = entry as Record<string, unknown>;
      if (typeof key !== 'string' || key === '' || key !== key.trim()) {
        fail(`[${index}].key должен быть непустой строкой без пробелов по краям`);
      }
      if (typeof title !== 'string' || title.trim() === '') fail(`[${index}].title должен быть непустой строкой`);
      if (description !== undefined && typeof description !== 'string') {
        fail(`[${index}].description должен быть строкой`);
      }
      if (keys.has(key as string)) fail(`повторяется key "${key as string}"`);
      keys.add(key as string);
    }
  }

  /** `x-field` и прочие подсказки редактора не входят в стандарт: отключаем strict-режим. */
  private createAjv() {
    return new Ajv2020({ strict: false, allErrors: true });
  }
}
