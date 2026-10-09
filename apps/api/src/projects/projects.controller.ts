import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';
import { ProjectsService } from './projects.service.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.projects.list(principal);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateProjectDto) {
    return this.projects.create(principal, dto);
  }

  @Get(':project')
  get(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.projects.get(principal, project);
  }

  @Patch(':project')
  update(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(principal, project, dto);
  }

  @Post(':project/ci-key')
  rotateCiKey(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.projects.rotateCiKey(principal, project);
  }
}
