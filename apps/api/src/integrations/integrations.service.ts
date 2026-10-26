import type { IntegrationType, TelegramChat } from '@crito/contract';
import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import { SecretBox, TELEGRAM_SECRET_CONTEXT } from '../common/secret-box.js';
import type { Prisma, ProjectIntegration } from '../generated/prisma/client.js';
import { FORM_KEY_PATTERN, MAX_FORMS } from './integrations.dto.js';
import type { UpdateTelegramIntegrationDto } from './integrations.dto.js';
import { readTelegramConfig } from './telegram-config.js';
import type { TelegramConfig } from './telegram-config.js';
import { escapeHtml } from './telegram-message.js';
import { TelegramNotifierService } from './telegram-notifier.service.js';
import { TelegramClient, TelegramError } from './telegram.client.js';

const MAX_LABEL_LENGTH = 100;

/** Что умеет CMS подключать. Новая интеграция добавляется сюда и в `IntegrationsDispatcher`. */
const CATALOG: Array<{ type: IntegrationType; title: string; description: string }> = [
  {
    type: 'telegram',
    title: 'Telegram',
    description: 'Уведомления менеджерам о новых заявках с форм сайта.',
  },
];

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly secrets: SecretBox,
    private readonly telegram: TelegramClient,
    private readonly notifier: TelegramNotifierService,
  ) {}

  /** Каталог: все известные интеграции и состояние каждой в проекте. */
  async list(principal: Principal, projectSlug: string) {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(projectSlug);
    const rows = await this.prisma.projectIntegration.findMany({ where: { projectId: project.id } });
    return CATALOG.map((entry) => {
      const row = rows.find((item) => item.type === entry.type);
      return {
        ...entry,
        configured: row ? isTelegramConfigured(row) : false,
        enabled: row?.enabled ?? false,
        lastSuccessAt: row?.lastSuccessAt ?? null,
        lastErrorAt: row?.lastErrorAt ?? null,
        lastError: row?.lastError ?? null,
      };
    });
  }

  async getTelegram(principal: Principal, projectSlug: string) {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(projectSlug);
    return toTelegramView(await this.findTelegram(project.id));
  }

  /** Сохраняет настройки; не переданное поле не меняется. Новый токен сначала проверяется в Telegram. */
  async updateTelegram(principal: Principal, projectSlug: string, dto: UpdateTelegramIntegrationDto) {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(projectSlug);
    const existing = await this.findTelegram(project.id);
    const current = readTelegramConfig(existing?.config);

    let secret = existing?.secret ?? null;
    let botUsername = current.botUsername;
    let tokenChanged = false;
    if (dto.botToken === '') {
      secret = null;
      botUsername = null;
      tokenChanged = true;
    } else if (dto.botToken !== undefined) {
      botUsername = (await this.verifyToken(dto.botToken)).username;
      secret = this.secrets.encrypt(dto.botToken, TELEGRAM_SECRET_CONTEXT);
      tokenChanged = true;
    }

    const config: TelegramConfig = {
      chats: dto.chats ? normalizeChats(dto.chats) : current.chats,
      forms: dto.forms ? [...new Set(dto.forms)] : current.forms,
      formLabels: dto.formLabels ? normalizeLabels(dto.formLabels) : current.formLabels,
      botUsername,
    };
    if (config.forms.length > MAX_FORMS) throw new BadRequestException(`Слишком много форм (максимум ${MAX_FORMS})`);

    // Без токена интеграцию не оставляем включённой: это было бы молчаливое «включено, но не работает».
    let enabled = dto.enabled ?? existing?.enabled ?? false;
    if (dto.botToken === '' && dto.enabled === undefined) enabled = false;
    if (enabled && !secret) throw new BadRequestException('Нельзя включить уведомления без токена бота');
    if (enabled && config.chats.length === 0) throw new BadRequestException('Добавьте хотя бы один чат или выключите уведомления');

    const data = {
      enabled,
      config: config as unknown as Prisma.InputJsonValue,
      secret,
      // Ошибки старого токена к новому не относятся.
      ...(tokenChanged ? { lastErrorAt: null, lastError: null } : {}),
    };
    const saved = await this.prisma.projectIntegration.upsert({
      where: { projectId_type: { projectId: project.id, type: 'telegram' } },
      create: { projectId: project.id, type: 'telegram', ...data },
      update: data,
    });
    return toTelegramView(saved);
  }

  /** Тестовое сообщение во все сохранённые чаты: результат по каждому чату. */
  async testTelegram(principal: Principal, projectSlug: string) {
    this.access.assertSuperAdmin(principal);
    const project = await this.prisma.project.findUnique({
      where: { slug: projectSlug },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    const row = await this.findTelegram(project.id);
    const config = readTelegramConfig(row?.config);
    if (!row?.secret || config.chats.length === 0) {
      throw new BadRequestException('Сначала сохраните токен бота и хотя бы один чат');
    }
    const token = this.secrets.decrypt(row.secret, TELEGRAM_SECRET_CONTEXT);
    const html = `<b>Проверка связи</b>\nУведомления о заявках проекта «${escapeHtml(project.name)}» подключены.`;
    return { results: await this.notifier.deliver(row.id, token, config.chats, html) };
  }

  /** Чаты, о которых знает бот: чтобы не искать chat_id вручную. */
  async discoverTelegramChats(principal: Principal, projectSlug: string) {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(projectSlug);
    const row = await this.findTelegram(project.id);
    if (!row?.secret) throw new BadRequestException('Сначала сохраните токен бота');
    const token = this.secrets.decrypt(row.secret, TELEGRAM_SECRET_CONTEXT);
    try {
      return { chats: await this.telegram.discoverChats(token) };
    } catch (error) {
      if (error instanceof TelegramError && error.status === 409) {
        throw new BadRequestException('У бота настроен вебхук Telegram, поиск чатов недоступен: введите chat_id вручную');
      }
      throw telegramFailure(error);
    }
  }

  async removeTelegram(principal: Principal, projectSlug: string): Promise<void> {
    this.access.assertSuperAdmin(principal);
    const project = await this.findProject(projectSlug);
    await this.prisma.projectIntegration.deleteMany({ where: { projectId: project.id, type: 'telegram' } });
  }

  private async verifyToken(token: string): Promise<{ username: string | null }> {
    try {
      return await this.telegram.getMe(token);
    } catch (error) {
      if (error instanceof TelegramError && error.kind === 'api' && (error.status === 401 || error.status === 404)) {
        throw new BadRequestException('Telegram не принял токен бота: проверьте его у @BotFather');
      }
      throw telegramFailure(error);
    }
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }

  private findTelegram(projectId: string) {
    return this.prisma.projectIntegration.findUnique({ where: { projectId_type: { projectId, type: 'telegram' } } });
  }
}

function telegramFailure(error: unknown): Error {
  return new BadGatewayException(error instanceof TelegramError ? error.message : 'Не удалось связаться с Telegram');
}

function isTelegramConfigured(row: ProjectIntegration): boolean {
  return Boolean(row.secret) && readTelegramConfig(row.config).chats.length > 0;
}

/** Ответ API. Токен не отдаётся никогда, только факт, что он сохранён. */
function toTelegramView(row: ProjectIntegration | null) {
  const config = readTelegramConfig(row?.config);
  return {
    enabled: row?.enabled ?? false,
    hasToken: Boolean(row?.secret),
    botUsername: config.botUsername,
    chats: config.chats,
    forms: config.forms,
    formLabels: config.formLabels,
    lastSuccessAt: row?.lastSuccessAt ?? null,
    lastErrorAt: row?.lastErrorAt ?? null,
    lastError: row?.lastError ?? null,
  };
}

function normalizeChats(chats: TelegramChat[]): TelegramChat[] {
  const unique = new Map<string, TelegramChat>();
  for (const chat of chats) {
    if (!unique.has(chat.id)) unique.set(chat.id, { id: chat.id, title: chat.title?.trim() || null });
  }
  return [...unique.values()];
}

function normalizeLabels(labels: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(labels);
  if (entries.length > MAX_FORMS) throw new BadRequestException(`formLabels: слишком много форм (максимум ${MAX_FORMS})`);
  const result: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (!FORM_KEY_PATTERN.test(key)) throw new BadRequestException(`formLabels: неверный ключ формы «${key.slice(0, 20)}»`);
    if (typeof value !== 'string' || value.length > MAX_LABEL_LENGTH) {
      throw new BadRequestException(`formLabels: название формы «${key}» должно быть строкой до ${MAX_LABEL_LENGTH} символов`);
    }
    if (value.trim()) result.push([key, value.trim()]);
  }
  // Не присваиванием по ключу: `__proto__` (допустимый ключ формы) иначе молча теряется.
  return Object.fromEntries(result);
}
