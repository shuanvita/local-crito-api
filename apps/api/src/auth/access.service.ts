import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Principal } from './auth.types.js';

/** Правила доступа: весь проект или отдельные страницы. Ролей нет, редактирование включает публикацию. */
@Injectable()
export class AccessService {
  hasProjectAccess(principal: Principal, project: string): boolean {
    return principal.isSuperAdmin || principal.grants.some((grant) => grant.project === project);
  }

  /** Право на весь проект: создание и удаление страниц, смена slug. */
  hasFullProjectAccess(principal: Principal, project: string): boolean {
    return (
      principal.isSuperAdmin ||
      principal.grants.some((grant) => grant.project === project && grant.scope === 'project')
    );
  }

  canEditPage(principal: Principal, project: string, pageId: string): boolean {
    if (this.hasFullProjectAccess(principal, project)) return true;
    return principal.grants.some(
      (grant) =>
        grant.project === project && grant.scope === 'pages' && grant.pageIds.includes(pageId),
    );
  }

  /** Id страниц, доступных пользователю, или `null`, если доступен весь проект. */
  allowedPageIds(principal: Principal, project: string): string[] | null {
    if (this.hasFullProjectAccess(principal, project)) return null;
    return principal.grants.flatMap((grant) =>
      grant.project === project && grant.scope === 'pages' ? grant.pageIds : [],
    );
  }

  assertProjectAccess(principal: Principal, project: string) {
    if (!this.hasProjectAccess(principal, project)) throw new ForbiddenException();
  }

  assertFullProjectAccess(principal: Principal, project: string) {
    if (!this.hasFullProjectAccess(principal, project)) throw new ForbiddenException();
  }

  assertCanEditPage(principal: Principal, project: string, pageId: string) {
    if (!this.canEditPage(principal, project, pageId)) throw new ForbiddenException();
  }

  assertSuperAdmin(principal: Principal) {
    if (!principal.isSuperAdmin) throw new ForbiddenException();
  }
}
