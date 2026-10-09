import { AccessService } from './access.service.js';
import type { Principal } from './auth.types.js';

const access = new AccessService();

const principal = (overrides: Partial<Principal>): Principal => ({
  userId: 'u1',
  email: 'u@example.com',
  isSuperAdmin: false,
  grants: [],
  ...overrides,
});

describe('AccessService', () => {
  it('без прав доступа к проекту нет', () => {
    const user = principal({});
    expect(access.hasProjectAccess(user, 'rucode')).toBe(false);
    expect(() => access.assertProjectAccess(user, 'rucode')).toThrow();
  });

  it('право на проект даёт доступ ко всем страницам и их созданию', () => {
    const user = principal({ grants: [{ project: 'rucode', scope: 'project' }] });
    expect(access.hasFullProjectAccess(user, 'rucode')).toBe(true);
    expect(access.canEditPage(user, 'rucode', 'any')).toBe(true);
    expect(access.allowedPageIds(user, 'rucode')).toBeNull();
    expect(access.hasProjectAccess(user, 'other')).toBe(false);
  });

  it('право на страницы ограничивает список и запрещает создание', () => {
    const user = principal({ grants: [{ project: 'rucode', scope: 'pages', pageIds: ['p1', 'p2'] }] });
    expect(access.hasProjectAccess(user, 'rucode')).toBe(true);
    expect(access.hasFullProjectAccess(user, 'rucode')).toBe(false);
    expect(access.canEditPage(user, 'rucode', 'p1')).toBe(true);
    expect(access.canEditPage(user, 'rucode', 'p3')).toBe(false);
    expect(access.allowedPageIds(user, 'rucode')).toEqual(['p1', 'p2']);
    expect(() => access.assertFullProjectAccess(user, 'rucode')).toThrow();
  });

  it('права на страницы другого проекта не действуют', () => {
    const user = principal({ grants: [{ project: 'other', scope: 'pages', pageIds: ['p1'] }] });
    expect(access.canEditPage(user, 'rucode', 'p1')).toBe(false);
  });

  it('суперадмин имеет доступ ко всему', () => {
    const user = principal({ isSuperAdmin: true });
    expect(access.canEditPage(user, 'rucode', 'x')).toBe(true);
    expect(() => access.assertSuperAdmin(user)).not.toThrow();
  });
});
