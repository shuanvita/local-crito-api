import { Module } from '@nestjs/common';
import { PublicRequestsController, RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  controllers: [RequestsController, PublicRequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
