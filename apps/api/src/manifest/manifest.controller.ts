import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../common/prisma.service.js';
import { hashKey } from '../projects/projects.service.js';
import { ManifestService } from './manifest.service.js';
import type { BlockManifest } from '@crito/contract';

/** Проверяет ключ CI (`x-ci-key`) по хешу в `Project.ciKeyHash`. */
@Injectable()
export class CiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-ci-key'];
    const slug = request.params.project;
    if (typeof key !== 'string' || typeof slug !== 'string') throw new UnauthorizedException();

    const project = await this.prisma.project.findUnique({
      where: { slug },
      select: { ciKeyHash: true },
    });
    const received = Buffer.from(hashKey(key));
    const expected = Buffer.from(project?.ciKeyHash ?? '');
    if (!project?.ciKeyHash || received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

@ApiTags('manifest')
@Controller('projects/:project/manifest')
export class ManifestController {
  constructor(
    private readonly manifest: ManifestService,
    private readonly access: AccessService,
  ) {}

  @ApiBearerAuth()
  @Get()
  async get(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    this.access.assertProjectAccess(principal, project);
    return this.manifest.get(project);
  }

  /** Вызывается из CI при деплое фронтенда, поэтому открыт для сессий, но закрыт ключом проекта. */
  @Public()
  @UseGuards(CiKeyGuard)
  @ApiHeader({ name: 'x-ci-key', required: true })
  @Put()
  put(@Param('project') project: string, @Body() body: BlockManifest) {
    return this.manifest.set(project, body);
  }
}
