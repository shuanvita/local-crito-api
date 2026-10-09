import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { CreatePageDto, UpdatePageDto } from './pages.dto.js';
import { PagesService } from './pages.service.js';

@ApiTags('pages')
@ApiBearerAuth()
@Controller('projects/:project/pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.pages.list(principal, project);
  }

  /** Корзина. Объявлена до `:id`, чтобы адрес `trash` не воспринимался как идентификатор страницы. */
  @Get('trash')
  listTrash(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.pages.listTrash(principal, project);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Body() dto: CreatePageDto,
  ) {
    return this.pages.create(principal, project, dto);
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.pages.get(principal, project, id);
  }

  @Put(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Param('id') id: string,
    @Body() dto: UpdatePageDto,
  ) {
    return this.pages.update(principal, project, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.pages.remove(principal, project, id);
  }

  @Post(':id/restore')
  restoreFromTrash(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.pages.restoreFromTrash(principal, project, id);
  }

  @Delete(':id/purge')
  @HttpCode(204)
  purge(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.pages.purge(principal, project, id);
  }

  @Get(':id/revisions')
  revisions(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.pages.revisions(principal, project, id);
  }

  @Post(':id/revisions/:version/restore')
  restore(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.pages.restoreRevision(principal, project, id, version);
  }
}
