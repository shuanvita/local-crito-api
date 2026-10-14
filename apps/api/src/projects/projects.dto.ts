import type { CreateProjectRequest, UpdateProjectRequest } from '@crito/contract';
import { IsOptional, IsString, IsUrl, Matches, MinLength, NotEquals, ValidateIf } from 'class-validator';

// Номер попадает в ссылку на Метрику в админке, поэтому только цифры: ничего, кроме числа, туда не пройдёт.
const METRIKA_ID_PATTERN = /^\d{1,12}$/;
const METRIKA_ID_MESSAGE = 'metrikaCounterId: только цифры, не больше 12 знаков';

export class CreateProjectDto implements CreateProjectRequest {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug: строчные латинские буквы, цифры и дефис' })
  // `dictionaries` занят общими справочниками: в админке это адрес /dictionaries/..., а не проект.
  @NotEquals('dictionaries', { message: 'slug dictionaries зарезервирован' })
  slug: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  defaultLocale?: string;

  /** Вебхук сайта для сброса кэша. */
  @IsOptional()
  @IsUrl({ require_tld: false })
  revalidateUrl?: string;

  @IsOptional()
  @Matches(METRIKA_ID_PATTERN, { message: METRIKA_ID_MESSAGE })
  metrikaCounterId?: string;

  @IsOptional()
  @IsString()
  revalidateSecret?: string;
}

export class UpdateProjectDto implements UpdateProjectRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  defaultLocale?: string;

  /** Пустая строка отключает вебхук. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_tld: false })
  revalidateUrl?: string;

  /** Пустая строка убирает номер счётчика. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(METRIKA_ID_PATTERN, { message: METRIKA_ID_MESSAGE })
  metrikaCounterId?: string;

  /** Новый секрет вебхука; пустая строка удаляет секрет. */
  @IsOptional()
  @IsString()
  revalidateSecret?: string;
}
