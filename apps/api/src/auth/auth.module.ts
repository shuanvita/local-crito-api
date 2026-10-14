import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessService } from './access.service.js';
import { AuthGuard } from './auth.guard.js';
import { MeController } from './me.controller.js';
import { SessionService } from './session.service.js';

@Global()
@Module({
  controllers: [MeController],
  providers: [SessionService, AccessService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SessionService, AccessService],
})
export class AuthModule {}
