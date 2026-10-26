import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationsDispatcher } from './integrations.dispatcher.js';
import { IntegrationsService } from './integrations.service.js';
import { TelegramNotifierService } from './telegram-notifier.service.js';
import { TelegramClient } from './telegram.client.js';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationsDispatcher, TelegramNotifierService, TelegramClient],
  exports: [IntegrationsDispatcher],
})
export class IntegrationsModule {}
