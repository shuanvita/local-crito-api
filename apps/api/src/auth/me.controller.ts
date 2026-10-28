import type { CurrentUser } from '@crito/contract';
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Principal } from './auth.types.js';
import { CurrentPrincipal } from './current-principal.decorator.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  me(@CurrentPrincipal() principal: Principal): CurrentUser {
    return {
      id: principal.userId,
      email: principal.email,
      name: principal.name ?? null,
      isSuperAdmin: principal.isSuperAdmin,
      viaLms: principal.viaLms === true,
    };
  }
}
