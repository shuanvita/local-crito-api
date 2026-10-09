import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { isDevelopment } from '../config/runtime.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Media } from '../generated/prisma/client.js';
import { StorageService } from '../storage/storage.service.js';
import { inspectFile } from './file-inspector.js';

/** Запись медиатеки внутри API: даты как Date. На проводе это контрактный `MediaItem` (проверяется в test/contract.check.ts). */
export type StoredMediaItem = Omit<Media, 'projectId' | 'uploadedById'> & { url: string };

@Injectable()
export class MediaService {
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    config: ConfigService,
  ) {
    // Адрес по умолчанию только для разработки; на проде PUBLIC_BASE_URL проверяет validateEnvironment.
    const configured = config.get<string>('PUBLIC_BASE_URL');
    if (!configured && !isDevelopment()) throw new Error('PUBLIC_BASE_URL не задан');
    this.baseUrl = (configured ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  /** Загрузка доступна всем, у кого есть доступ к проекту: картинки нужны и при правке отдельных страниц. */
  async upload(principal: Principal, projectSlug: string, file: Express.Multer.File | undefined) {
    this.access.assertProjectAccess(principal, projectSlug);
    if (!file) throw new BadRequestException('Файл не передан (поле "file")');
    const project = await this.findProject(projectSlug);

    const inspected = await inspectFile(file.buffer);
    const sha256 = createHash('sha256').update(inspected.buffer).digest('hex');
    const key = `${project.slug}/${sha256}.${inspected.type.ext}`;

    // Тот же файл уже загружен: возвращаем существующую запись.
    const existing = await this.prisma.media.findUnique({
      where: { projectId_sha256: { projectId: project.id, sha256 } },
    });
    if (existing) return this.toItem(existing);

    await this.storage.put(key, inspected.buffer, inspected.type.mime);
    try {
      const media = await this.prisma.media.create({
        data: {
          projectId: project.id,
          key,
          sha256,
          mime: inspected.type.mime,
          size: inspected.buffer.length,
          width: inspected.width,
          height: inspected.height,
          originalName: cleanName(file.originalname),
          uploadedById: principal.userId,
        },
      });
      return this.toItem(media);
    } catch (error) {
      // Параллельная загрузка того же файла: запись уже создана другим запросом.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.media.findUnique({
          where: { projectId_sha256: { projectId: project.id, sha256 } },
        });
        if (raced) return this.toItem(raced);
      }
      throw error;
    }
  }

  async list(principal: Principal, projectSlug: string, search?: string) {
    this.access.assertProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const items = await this.prisma.media.findMany({
      where: {
        projectId: project.id,
        ...(search ? { originalName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return items.map((item) => this.toItem(item));
  }

  /** Удаление запрещено, пока файл используется на страницах проекта. */
  async remove(principal: Principal, projectSlug: string, id: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const media = await this.prisma.media.findFirst({ where: { id, projectId: project.id } });
    if (!media) throw new NotFoundException('Файл не найден');

    // Страницы из корзины тоже считаются: после восстановления они снова покажутся на сайте.
    const usedOn = await this.prisma.$queryRaw<{ slug: string; deletedAt: Date | null }[]>(Prisma.sql`
      SELECT "slug", "deletedAt" FROM "Page"
      WHERE "projectId" = ${project.id}
        AND (position(${media.key} in "blocks"::text) > 0 OR position(${media.key} in coalesce("meta"::text, '')) > 0)
      ORDER BY "slug"
    `);
    if (usedOn.length > 0) {
      throw new ConflictException({
        message: 'Файл используется на страницах',
        pages: usedOn.map((page) => (page.deletedAt ? `${page.slug} (в корзине)` : page.slug)),
      });
    }

    await this.prisma.media.delete({ where: { id } });
    await this.storage.delete(media.key);
  }

  private toItem(media: Media): StoredMediaItem {
    const { projectId: _projectId, uploadedById: _uploadedById, ...rest } = media;
    return { ...rest, url: `${this.baseUrl}/media/${media.key}` };
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }
}

const isControlChar = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f;
};

/**
 * Multer (busboy) читает имя файла из multipart как latin1, поэтому кириллица приходит «кракозябрами».
 * Если все символы укладываются в latin1 и перекодирование в UTF-8 даёт корректную строку, берём её.
 */
export function fixFilenameEncoding(name: string): string {
  if ([...name].some((char) => (char.codePointAt(0) ?? 0) > 0xff)) return name; // уже настоящий Unicode
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/** Имя файла только для отображения: без пути, управляющих символов и с ограничением длины. */
export function cleanName(name: string): string {
  const withoutPath = basename(fixFilenameEncoding(name).replaceAll('\\', '/'));
  const cleaned = [...withoutPath].filter((char) => !isControlChar(char)).join('').trim();
  return (cleaned || 'file').slice(0, 200);
}
