import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from './auth.types.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { LmsAccessDto } from './lms-access.dto.js';
import { LmsAccessService } from './lms-access.service.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects/:project/lms-access')
export class LmsAccessController {
  constructor(private readonly lmsAccess: LmsAccessService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.lmsAccess.get(principal, project);
  }

  @Put()
  put(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Body() dto: LmsAccessDto) {
    return this.lmsAccess.put(principal, project, dto);
  }
}
