import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { CreateRegionDto, UpdateRegionDto } from './dictionaries.dto.js';
import { DictionariesService } from './dictionaries.service.js';

@ApiTags('dictionaries')
@ApiBearerAuth()
@Controller('dictionaries/regions')
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  list() {
    return this.dictionaries.listRegions();
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateRegionDto) {
    return this.dictionaries.createRegion(principal, dto);
  }

  @Patch(':id')
  update(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.dictionaries.updateRegion(principal, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.dictionaries.removeRegion(principal, id);
  }
}
