import { Injectable } from '@nestjs/common';
import { TelegramNotifierService } from './telegram-notifier.service.js';
import type { SubmissionNotification } from './telegram-notifier.service.js';

/**
 * Единая точка, через которую события сайта доходят до интеграций. Приём заявки знает только о ней,
 * а новая интеграция подключается здесь, не трогая приём. Вызов не ждёт доставки.
 */
@Injectable()
export class IntegrationsDispatcher {
  constructor(private readonly telegram: TelegramNotifierService) {}

  onSubmission(event: SubmissionNotification): void {
    this.telegram.notify(event);
  }
}
