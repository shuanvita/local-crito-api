import type { SubmissionFieldValue } from '@crito/contract';
import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../auth/access.service.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../common/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ListSubmissionsQuery, SubmitFormDto } from './requests.dto.js';

const MAX_FIELDS = 50;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 5000;
const MAX_LIST_ITEMS = 50;
/** Общий размер полей: форма участия укладывается в килобайты, больше это уже не заявка. */
const MAX_TOTAL_LENGTH = 50_000;
const DEFAULT_PAGE_SIZE = 50;

/** Не больше стольких заявок в минуту на проект: защита от заливки, а не лимит на человека (сайт ходит через свой сервер). */
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_WINDOW_MS = 60_000;

/** Заявка внутри API: даты как Date. На проводе это контрактный `FormSubmissionItem` (см. test/contract.check.ts). */
export interface StoredSubmission {
  id: string;
  form: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pageUrl: string | null;
  createdAt: Date;
}

export type StoredSubmissionDetail = StoredSubmission & { fields: Record<string, SubmissionFieldValue> };

const listSelect = {
  id: true,
  formKey: true,
  name: true,
  email: true,
  phone: true,
  pageUrl: true,
  createdAt: true,
} satisfies Prisma.FormSubmissionSelect;

@Injectable()
export class RequestsService {
  /** Время приёма заявок по проектам за последнюю минуту: в памяти процесса, при перезапуске обнуляется. */
  private readonly accepted = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Публичный приём. Ловушка для ботов отвечает так же, как успех, но ничего не сохраняет:
   * бот не узнаёт, что его заметили. Неизвестный проект это 404 (как у публичных страниц).
   */
  async submit(projectSlug: string, dto: SubmitFormDto): Promise<{ accepted: true }> {
    const project = await this.prisma.project.findUnique({ where: { slug: projectSlug }, select: { id: true } });
    if (!project) throw new NotFoundException('Проект не найден');

    if (dto.website) return { accepted: true };

    this.assertRateLimit(project.id);
    const fields = normalizeFields(dto.fields);

    await this.prisma.formSubmission.create({
      data: {
        projectId: project.id,
        formKey: dto.form,
        name: pickText(fields, 'name'),
        email: pickText(fields, 'email'),
        phone: pickText(fields, 'phone'),
        pageUrl: dto.pageUrl?.trim() || null,
        fields: fields as unknown as Prisma.InputJsonValue,
        searchText: buildSearchText(fields),
      },
    });
    return { accepted: true };
  }

  /** Заявки содержат персональные данные: только при доступе ко всему проекту. */
  async list(principal: Principal, projectSlug: string, query: ListSubmissionsQuery) {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);

    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = new Date(query.from);
    if (query.to) created.lt = new Date(query.to);
    const search = query.q?.trim().toLowerCase();
    const where: Prisma.FormSubmissionWhereInput = {
      projectId: project.id,
      ...(query.form ? { formKey: query.form } : {}),
      ...(Object.keys(created).length ? { createdAt: created } : {}),
      ...(search ? { searchText: { contains: search } } : {}),
    };

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const [rows, total, forms] = await Promise.all([
      this.prisma.formSubmission.findMany({
        where,
        select: listSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        // Курсор чужого проекта или несуществующий не найдётся: Prisma вернёт пустой список.
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.formSubmission.count({ where }),
      this.prisma.formSubmission.findMany({
        where: { projectId: project.id },
        select: { formKey: true },
        distinct: ['formKey'],
        orderBy: { formKey: 'asc' },
      }),
    ]);

    const page = rows.slice(0, limit);
    return {
      items: page.map(toItem),
      total,
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
      forms: forms.map((row) => row.formKey),
    };
  }

  async get(principal: Principal, projectSlug: string, id: string): Promise<StoredSubmissionDetail> {
    this.access.assertFullProjectAccess(principal, projectSlug);
    const project = await this.findProject(projectSlug);
    // Фильтр по проекту обязателен: заявка другого проекта для этого проекта не существует.
    const row = await this.prisma.formSubmission.findFirst({
      where: { id, projectId: project.id },
      select: { ...listSelect, fields: true },
    });
    if (!row) throw new NotFoundException('Заявка не найдена');
    return { ...toItem(row), fields: row.fields as unknown as Record<string, SubmissionFieldValue> };
  }

  private assertRateLimit(projectId: string) {
    const now = Date.now();
    const recent = (this.accepted.get(projectId) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) {
      this.accepted.set(projectId, recent);
      throw new HttpException('Слишком много заявок, попробуйте позже', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.accepted.set(projectId, recent);
  }

  private async findProject(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!project) throw new NotFoundException('Проект не найден');
    return project;
  }
}

function toItem(row: {
  id: string;
  formKey: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pageUrl: string | null;
  createdAt: Date;
}): StoredSubmission {
  return {
    id: row.id,
    form: row.formKey,
    name: row.name,
    email: row.email,
    phone: row.phone,
    pageUrl: row.pageUrl,
    createdAt: row.createdAt,
  };
}

/** Проверка формы значений и лимитов; возвращает очищенные поля (строки обрезаны по краям). */
export function normalizeFields(input: unknown): Record<string, SubmissionFieldValue> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('fields должен быть объектом');
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) throw new BadRequestException('Заявка без полей');
  if (entries.length > MAX_FIELDS) throw new BadRequestException(`Слишком много полей (максимум ${MAX_FIELDS})`);

  const result: Record<string, SubmissionFieldValue> = Object.create(null);
  let total = 0;
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(`Имя поля «${key.slice(0, 20)}» пустое или длиннее ${MAX_KEY_LENGTH} символов`);
    }
    const cleaned = Array.isArray(value) ? cleanList(key, value) : cleanText(key, value);
    total += key.length + (Array.isArray(cleaned) ? cleaned.join('').length : cleaned.length);
    result[key] = cleaned;
  }
  if (total > MAX_TOTAL_LENGTH) throw new BadRequestException('Заявка слишком большая');
  return { ...result };
}

function cleanText(key: string, value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException(`Поле «${key}»: ожидается строка или список строк`);
  if (value.length > MAX_VALUE_LENGTH) throw new BadRequestException(`Поле «${key}» длиннее ${MAX_VALUE_LENGTH} символов`);
  return value.trim();
}

function cleanList(key: string, value: unknown[]): string[] {
  if (value.length > MAX_LIST_ITEMS) throw new BadRequestException(`Поле «${key}»: слишком много значений`);
  return value.map((item) => cleanText(key, item));
}

function pickText(fields: Record<string, SubmissionFieldValue>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value ? value.slice(0, 500) : null;
}

function buildSearchText(fields: Record<string, SubmissionFieldValue>): string {
  return Object.values(fields)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .join('\n')
    .toLowerCase();
}
