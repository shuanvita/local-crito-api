import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../common/prisma.service.js';
import { HealthController } from './health.controller.js';

const controller = (query: () => Promise<unknown>) =>
  new HealthController({ $queryRaw: query } as unknown as PrismaService);

describe('HealthController', () => {
  it('сообщает, что приложение и БД работают', async () => {
    await expect(controller(async () => [{ '?column?': 1 }]).check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('при недоступной БД отвечает 503 и не раскрывает причину', async () => {
    const failing = controller(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password authentication failed');
    });
    const error = await failing.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).toBe('{"status":"error","database":"down"}');
  });
});
