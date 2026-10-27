import type { SubmitFormRequest, SubmissionFieldValue } from '@crito/contract';
import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Тело приёма заявки. Содержимое `fields` проверяет сервис (форма значений и лимиты). */
export class SubmitFormDto implements SubmitFormRequest {
  /** Ключ формы: латиница, цифры, дефис и подчёркивание, чтобы по нему было удобно фильтровать. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  form: string;

  @IsObject()
  fields: Record<string, SubmissionFieldValue>;

  /** Подписи полей. Форму значений и лимиты проверяет сервис: сбой подписи не должен терять заявку. */
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

/** Параметры списка заявок: все необязательные. */
export class ListSubmissionsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  form?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Начало периода, включительно (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Конец периода, исключая (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
