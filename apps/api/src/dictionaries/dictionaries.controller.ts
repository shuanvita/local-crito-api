import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { CreateRegionDto, UpdateRegionDto } from './dictionaries.dto.js';
import { DictionariesService } from './dictionaries.service.js';

@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('projects/:project/dictionaries/regions')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Param('project') project: string) {
    return this.dictionaries.listRegions(principal, project);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Body() dto: CreateRegionDto) {
    return this.dictionaries.createRegion(principal, project, dto);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Param('id') id: string,
    @Body() dto: UpdateRegionDto,
  ) {
    return this.dictionaries.updateRegion(principal, project, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPrincipal() principal: Principal, @Param('project') project: string, @Param('id') id: string) {
    return this.dictionaries.removeRegion(principal, project, id);
  }
}
