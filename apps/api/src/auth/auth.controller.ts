import type { LoginResponse } from '@crito/contract';
import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './auth.dto.js';
import type { Principal } from './auth.types.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { LocalAuthService } from './local-auth.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly localAuth: LocalAuthService) {}

  /**
   * Вход по почте и паролю. Токен отдаётся серверному прокси админки, который кладёт его в httpOnly-cookie;
   * IP клиента прокси передаёт в `x-crito-client-ip` (API слушает только локальный интерфейс).
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Headers('x-crito-client-ip') clientIp: string | undefined,
    @Ip() ip: string,
  ): Promise<LoginResponse> {
    return this.localAuth.login(dto.email, dto.password, clientIp?.trim() || ip);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentPrincipal() principal: Principal) {
    if (principal.sessionId) await this.localAuth.logout(principal.sessionId);
  }
}
