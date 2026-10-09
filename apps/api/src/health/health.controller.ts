import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../common/prisma.service.js';

/** Проверка живости для балансировщика и оркестратора. Подробности об ошибке наружу не отдаются. */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
  }
}
