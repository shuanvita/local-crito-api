import { Injectable, NotFoundException } from '@nestjs/common';
import type { SiteSettings } from '@crito/contract';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { ManifestService } from '../manifest/manifest.service.js';
import { RevalidateService } from '../pages/revalidate.service.js';
import type { UpdateSettingsDto } from './settings.dto.js';

/**
 * Общие настройки сайта: одно значение на проект, без версий и корзины. Форму задаёт `settingsSchema` манифеста,
 * по ней же сервер проверяет и очищает данные. Хранится текстом, чтобы сохранить порядок полей.
 * Читает и правит только тот, у кого есть доступ ко всему проекту: настройки касаются каждой страницы сайта.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly manifest: ManifestService,
    private readonly revalidate: RevalidateService,
  ) {}

  async get(principal: Principal, projectSlug: string): Promise<{ settings: SiteSettings | null }> {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.prisma.project.findUnique({ where: { slug: projectSlug }, select: { settings: true } });
    if (!project) throw new NotFoundException('Проект не найден');
    return { settings: parseSettings(project.settings) };
  }

  /** Сохраняет настройки сразу (без публикации) и сбрасывает кэш сайта. */
  async update(principal: Principal, projectSlug: string, dto: UpdateSettingsDto): Promise<{ settings: SiteSettings }> {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');

    const settings = await this.manifest.prepareSettings(projectSlug, dto.settings);
    await this.prisma.project.update({ where: { id: project.id }, data: { settings: JSON.stringify(settings) } });
    this.revalidate.notify(project);
    return { settings };
  }
}

export function parseSettings(text: string | null): SiteSettings | null {
  return text ? (JSON.parse(text) as SiteSettings) : null;
}
