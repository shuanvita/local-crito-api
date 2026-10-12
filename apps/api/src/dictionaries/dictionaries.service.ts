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
 * Справочники проекта. Сейчас один: «Регионы».
 *
 * Справочник это данные всего проекта, а не отдельной страницы, поэтому и чтение, и правка требуют
 * доступа ко всему проекту (доступ только к страницам справочники не видит). Каждое изменение
 * сбрасывает кэш сайта: сайт читает справочник публично и кэширует ответ.
 */
@Injectable()
export class DictionariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly revalidate: RevalidateService,
  ) {}

  async listRegions(principal: Principal, projectSlug: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    return this.prisma.region.findMany({
      where: { projectId: project.id },
      select: regionSelect,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createRegion(principal: Principal, projectSlug: string, dto: CreateRegionDto) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    await this.assertValueFree(project.id, dto.value);

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(project.id));
    const region = await this.prisma.region.create({
      data: { projectId: project.id, value: dto.value, label: dto.label, sortOrder },
      select: regionSelect,
    });
    this.revalidate.notify(project);
    return region;
  }

  async updateRegion(principal: Principal, projectSlug: string, id: string, dto: UpdateRegionDto) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    const existing = await this.findRegion(project.id, id);
    if (dto.value !== undefined && dto.value !== existing.value) {
      await this.assertValueFree(project.id, dto.value);
    }

    const region = await this.prisma.region.update({
      where: { id },
      data: { value: dto.value, label: dto.label, sortOrder: dto.sortOrder },
      select: regionSelect,
    });
    this.revalidate.notify(project);
    return region;
  }

  async removeRegion(principal: Principal, projectSlug: string, id: string) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    await this.findRegion(project.id, id);
    await this.prisma.region.delete({ where: { id } });
    this.revalidate.notify(project);
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      select: { id: true, slug: true, revalidateUrl: true, revalidateSecret: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }

  /** Регион ищется внутри проекта: чужой id даёт 404, а не доступ к данным другого сайта. */
  private async findRegion(projectId: string, id: string) {
    const region = await this.prisma.region.findFirst({ where: { id, projectId }, select: regionSelect });
    if (!region) throw new NotFoundException('Регион не найден');
    return region;
  }

  private async assertValueFree(projectId: string, value: number) {
    const taken = await this.prisma.region.findUnique({
      where: { projectId_value: { projectId, value } },
      select: { label: true },
    });
    if (taken) throw new ConflictException(`Регион с идентификатором ${value} уже есть: «${taken.label}»`);
  }

  private async nextSortOrder(projectId: string): Promise<number> {
    const last = await this.prisma.region.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + ORDER_STEP;
  }
}
