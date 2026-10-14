import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { RevalidateService } from '../pages/revalidate.service.js';
import { CreateRegionDto, UpdateRegionDto } from './dictionaries.dto.js';

/** Шаг порядка: между соседними регионами остаётся место, чтобы вставлять без пересчёта остальных. */
const ORDER_STEP = 10;

const regionSelect = { id: true, value: true, label: true, sortOrder: true } as const;

/**
 * Общие справочники CMS. Сейчас один: «Регионы».
 *
 * Справочник не принадлежит проекту: его читают сайты всех проектов, поэтому ошибка правки ломает их все.
 * Правит только администратор админки (доступ ко всему проекту для этого недостаточно). Читать список
 * в админке может любой вошедший пользователь: те же данные публично отдаёт `/public/dictionaries/regions`.
 * Каждое изменение сбрасывает кэш всех сайтов: они читают справочник публично и кэшируют ответ.
 */
@Injectable()
export class DictionariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly revalidate: RevalidateService,
  ) {}

  listRegions() {
    return this.prisma.region.findMany({
      select: regionSelect,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createRegion(principal: Principal, dto: CreateRegionDto) {
    this.access.assertSuperAdmin(principal);
    await this.assertValueFree(dto.value);

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder());
    const region = await this.prisma.region.create({
      data: { value: dto.value, label: dto.label, sortOrder },
      select: regionSelect,
    });
    await this.notifySites();
    return region;
  }

  async updateRegion(principal: Principal, id: string, dto: UpdateRegionDto) {
    this.access.assertSuperAdmin(principal);
    const existing = await this.findRegion(id);
    if (dto.value !== undefined && dto.value !== existing.value) {
      await this.assertValueFree(dto.value);
    }

    const region = await this.prisma.region.update({
      where: { id },
      data: { value: dto.value, label: dto.label, sortOrder: dto.sortOrder },
      select: regionSelect,
    });
    await this.notifySites();
    return region;
  }

  async removeRegion(principal: Principal, id: string) {
    this.access.assertSuperAdmin(principal);
    await this.findRegion(id);
    await this.prisma.region.delete({ where: { id } });
    await this.notifySites();
  }

  /** Вебхук каждого проекта, у которого он настроен; сами вызовы идут в фоне. */
  private async notifySites() {
    const projects = await this.prisma.project.findMany({
      where: { revalidateUrl: { not: null } },
      select: { slug: true, revalidateUrl: true, revalidateSecret: true },
    });
    for (const project of projects) this.revalidate.notify(project);
  }

  private async findRegion(id: string) {
    const region = await this.prisma.region.findUnique({ where: { id }, select: regionSelect });
    if (!region) throw new NotFoundException('Регион не найден');
    return region;
  }

  private async assertValueFree(value: number) {
    const taken = await this.prisma.region.findUnique({ where: { value }, select: { label: true } });
    if (taken) throw new ConflictException(`Регион с идентификатором ${value} уже есть: «${taken.label}»`);
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.region.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + ORDER_STEP;
  }
}
