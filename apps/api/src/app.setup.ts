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

  // Файлы подключаются с сайтов и из админки на других origin. helmet ставит same-origin на все ответы, в том числе
  // на ошибки: без этого 404 картинки браузер показывает как ERR_BLOCKED_BY_RESPONSE.NotSameOrigin и скрывает причину.
  app.use('/media', (_req: unknown, res: { set(name: string, value: string): void }, next: () => void) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}
