import type { LoginResponse } from '@crito/contract';
import { BadRequestException, Body, Controller, Headers, HttpCode, Ip, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../common/prisma.service.js';
import { ChangePasswordDto, LoginDto } from './auth.dto.js';
import type { Principal } from './auth.types.js';
import { CurrentPrincipal } from './current-principal.decorator.js';
import { LocalAuthService } from './local-auth.service.js';
import { PasswordService } from './password.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly localAuth: LocalAuthService,
    private readonly passwords: PasswordService,
    private readonly prisma: PrismaService,
  ) {}

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

  /** Смена своего пароля; остальные сессии пользователя обрываются, текущая остаётся. */
  @ApiBearerAuth()
  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentPrincipal() principal: Principal, @Body() dto: ChangePasswordDto) {
    if (!principal.sessionId) throw new BadRequestException('Пароль меняется только при входе по паролю');
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user?.passwordHash || !(await this.passwords.verify(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Неверный текущий пароль');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
    await this.localAuth.revokeSessions(user.id, principal.sessionId);
  }
}
