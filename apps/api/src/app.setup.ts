import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Лимит JSON-тела. По умолчанию Express принимает около 100 КБ, но манифест блоков сайта
 * (десятки блоков со схемами) и страница с большим текстом легко его превышают.
 */
export const JSON_BODY_LIMIT = '5mb';

/** Общая настройка приложения: используется при запуске и в e2e-тестах, чтобы они вели себя одинаково. */
export function configureApp(app: INestApplication): void {
  (app as NestExpressApplication).useBodyParser('json', { limit: JSON_BODY_LIMIT });

  // Защитные заголовки (в том числе скрывается X-Powered-By). CSP отключён: API отдаёт JSON и файлы,
  // а файлы SVG получают свою политику в MediaPublicController.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
