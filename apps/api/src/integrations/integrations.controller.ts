import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { UpdateTelegramIntegrationDto } from './integrations.dto.js';
import { IntegrationsService } from './integrations.service.js';

/** Интеграции проекта. В них хранятся токены, поэтому всё только для суперадминистратора. */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('projects/:project/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.integrations.list(principal, project);
  }

  @Get('telegram')
  getTelegram(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.integrations.getTelegram(principal, project);
  }

  @Put('telegram')
  updateTelegram(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Body() dto: UpdateTelegramIntegrationDto,
  ) {
    return this.integrations.updateTelegram(principal, project, dto);
  }

  @Post('telegram/test')
  @HttpCode(200)
  testTelegram(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.integrations.testTelegram(principal, project);
  }

  @Post('telegram/discover-chats')
  @HttpCode(200)
  discoverTelegramChats(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.integrations.discoverTelegramChats(principal, project);
  }

  @Delete('telegram')
  @HttpCode(204)
  removeTelegram(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.integrations.removeTelegram(principal, project);
  }
}
