import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { ListSubmissionsQuery, SubmitFormDto } from './requests.dto.js';
import { RequestsService } from './requests.service.js';

/** Чтение заявок менеджерами: в рамках одного проекта, только при доступе ко всему проекту. */
@ApiTags('requests')
@ApiBearerAuth()
@Controller('projects/:project/requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Query() query: ListSubmissionsQuery,
  ) {
    return this.requests.list(principal, project, query);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.requests.get(principal, project, id);
  }
}

/** Приём заявок с форм сайта. Открыт, как и остальное публичное чтение: сайт вызывает его со своего сервера. */
@ApiTags('public')
@Public()
@Controller('public/:project/requests')
export class PublicRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @HttpCode(201)
  submit(@Param('project') project: string, @Body() dto: SubmitFormDto) {
    return this.requests.submit(project, dto);
  }
}
