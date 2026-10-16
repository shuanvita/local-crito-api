import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { UpdateSettingsDto } from './settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('projects/:project/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.settings.get(principal, project);
  }

  @Put()
  update(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(principal, project, dto);
  }
}
