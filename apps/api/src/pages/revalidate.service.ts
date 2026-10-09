import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { REVALIDATE_SECRET_CONTEXT, SecretBox } from '../common/secret-box.js';

interface RevalidateTarget {
  slug: string;
  revalidateUrl: string | null;
  revalidateSecret: string | null;
}

/**
 * Сбрасывает серверный кэш сайта после публикации.
 *
 * Вызов идёт в фоне: сохранение страницы не должно ждать сайт (он может быть недоступен или тормозить),
 * а ошибка вебхука не должна ломать сохранение. Если сайт не ответил, кэш сбросится сам по TTL.
 */
@Injectable()
export class RevalidateService implements OnApplicationShutdown {
  private readonly logger = new Logger(RevalidateService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly secrets: SecretBox) {}

  /** Ставит вызов вебхука в фон и сразу возвращает управление. */
  notify(project: RevalidateTarget): void {
    if (!project.revalidateUrl) return;
    const task: Promise<void> = this.send(project, project.revalidateUrl).finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /** Дожидается незавершённых вызовов: нужно при остановке сервера и в консольных скриптах. */
  async flush(): Promise<void> {
    await Promise.allSettled(this.pending);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  private async send(project: RevalidateTarget, url: string): Promise<void> {
    try {
      // В БД секрет лежит зашифрованным: расшифровываем только на время запроса.
      const secret = project.revalidateSecret
        ? this.secrets.decrypt(project.revalidateSecret, REVALIDATE_SECRET_CONTEXT)
        : '';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-revalidate-secret': secret },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`Вебхук ${project.slug} ответил ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Вебхук ${project.slug} недоступен: ${(error as Error).message}`);
    }
  }
}
