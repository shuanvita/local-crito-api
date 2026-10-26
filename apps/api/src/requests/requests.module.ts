import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { PublicRequestsController, RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [IntegrationsModule],
  controllers: [RequestsController, PublicRequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
