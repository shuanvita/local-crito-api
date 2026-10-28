import type { LmsAccess, LmsRoleProfile } from '@crito/contract';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { AccessService } from './access.service.js';
import type { LmsAccessDto } from './lms-access.dto.js';
import type { Principal } from './auth.types.js';

/** Привязка групп LMS к проекту и профили ролей. Правит только суперадмин; состав групп правят в LMS. */
@Injectable()
export class LmsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async get(principal: Principal, slug: string): Promise<LmsAccess> {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(slug);
    const [groups, roles] = await Promise.all([
      this.prisma.projectLmsGroup.findMany({ where: { projectId: project.id }, orderBy: { groupId: 'asc' } }),
      this.prisma.projectLmsRole.findMany({ where: { projectId: project.id }, orderBy: { role: 'asc' } }),
    ]);
    return {
      groups: groups.map((group) => group.groupId),
      roles: roles.map((role) => ({
        role: role.role,
        scope: role.scope === 'pages' ? 'pages' : 'project',
        pageIds: role.pageIds,
        requests: role.requests,
      })),
    };
  }

  /** Заменяет настройки целиком: пустые списки снимают доступ из LMS к проекту. */
  async put(principal: Principal, slug: string, dto: LmsAccessDto): Promise<LmsAccess> {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(slug);
    const groups = this.normalizeGroups(dto.groups);
    const roles = await this.normalizeRoles(project.id, dto.roles);

    await this.prisma.$transaction([
      this.prisma.projectLmsGroup.deleteMany({ where: { projectId: project.id } }),
      this.prisma.projectLmsGroup.createMany({ data: groups.map((groupId) => ({ projectId: project.id, groupId })) }),
      this.prisma.projectLmsRole.deleteMany({ where: { projectId: project.id } }),
      this.prisma.projectLmsRole.createMany({ data: roles.map((role) => ({ projectId: project.id, ...role })) }),
    ]);
    return this.get(principal, slug);
  }

  private normalizeGroups(groups: unknown): string[] {
    if (!Array.isArray(groups) || groups.length > 100) throw new BadRequestException('Некорректный список групп');
    const result = new Set<string>();
    for (const group of groups) {
      const id = typeof group === 'string' ? group.trim() : '';
      // Запятая разделяет группы в заголовке LMS: id с запятой никогда не совпал бы.
      if (!id || id.length > 128 || id.includes(',')) throw new BadRequestException('Некорректный id группы');
      result.add(id);
    }
    return [...result];
  }

  private async normalizeRoles(projectId: string, roles: unknown): Promise<LmsRoleProfile[]> {
    if (!Array.isArray(roles) || roles.length > 50) throw new BadRequestException('Некорректный список ролей');
    const seen = new Set<string>();
    const result: LmsRoleProfile[] = [];
    for (const item of roles as Array<Partial<LmsRoleProfile> | null>) {
      const role = typeof item?.role === 'string' ? item.role.trim().toLowerCase() : '';
      if (!role || role.length > 64) throw new BadRequestException('Некорректное название роли');
      if (seen.has(role)) throw new BadRequestException(`Роль «${role}» указана дважды`);
      seen.add(role);
      if (item?.scope !== 'project' && item?.scope !== 'pages') {
        throw new BadRequestException(`Некорректная область роли «${role}»`);
      }
      if (typeof item.requests !== 'boolean') throw new BadRequestException(`Не задан доступ к заявкам для роли «${role}»`);
      if (item.scope === 'project') {
        result.push({ role, scope: 'project', pageIds: [], requests: item.requests });
        continue;
      }
      const ids = item.pageIds;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
        throw new BadRequestException(`Для роли «${role}» выберите хотя бы одну страницу`);
      }
      const pageIds = [...new Set(ids)];
      const found = await this.prisma.page.count({ where: { projectId, id: { in: pageIds } } });
      if (found !== pageIds.length) throw new BadRequestException(`Не все страницы роли «${role}» найдены в проекте`);
      result.push({ role, scope: 'pages', pageIds, requests: item.requests });
    }
    return result;
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }
}
