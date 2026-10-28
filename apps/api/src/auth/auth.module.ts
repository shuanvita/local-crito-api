import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessService } from './access.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { LmsAccessController } from './lms-access.controller.js';
import { LmsAccessService } from './lms-access.service.js';
import { LmsAuthService } from './lms-auth.service.js';
import { LocalAuthService } from './local-auth.service.js';
import { MeController } from './me.controller.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Global()
@Module({
  controllers: [MeController, AuthController, UsersController, LmsAccessController],
  providers: [
    SessionService,
    AccessService,
    PasswordService,
    LocalAuthService,
    LmsAuthService,
    LmsAccessService,
    UsersService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, AccessService, PasswordService, LocalAuthService, UsersService],
})
export class AuthModule {}
