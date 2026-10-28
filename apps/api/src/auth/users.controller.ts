import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UserGrantsDto } from './auth.dto.js';
import type { Principal } from './auth.types.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { UsersService } from './users.service.js';

/** Страница «Доступы»: только суперадмин (проверяет сервис). */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.users.list(principal);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateUserDto) {
    return this.users.create(principal, dto);
  }

  @Patch(':id')
  update(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(principal, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  resetPassword(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(principal, id, dto.password);
  }

  @Put(':id/grants')
  setGrants(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() dto: UserGrantsDto) {
    return this.users.setGrants(principal, id, dto);
  }
}
