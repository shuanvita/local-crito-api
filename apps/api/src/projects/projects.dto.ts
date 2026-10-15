import type { CreateProjectRequest, UpdateProjectRequest } from '@crito/contract';
import { IsOptional, IsString, IsUrl, Matches, MinLength, NotEquals, ValidateIf } from 'class-validator';

// Номер попадает в ссылку на Метрику в админке, поэтому только цифры: ничего, кроме числа, туда не пройдёт.
const METRIKA_ID_PATTERN = /^\d{1,12}$/;
const METRIKA_ID_MESSAGE = 'metrikaCounterId: только цифры, не больше 12 знаков';

// Адрес сайта идёт в iframe и в ссылки админки: только http(s) без пути, чтобы не прошли `javascript:` и подобное.
// `http://` разрешён для localhost: на живом сайте смешанный контент всё равно заблокировал бы iframe.
const SITE_URL_PATTERN = /^(https:\/\/[^\s/?#@]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/?$/;
const SITE_URL_MESSAGE = 'siteUrl: адрес сайта вида https://example.com, без пути (http:// только для localhost)';

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

  /** Адрес сайта для предпросмотра страниц в админке. */
  @IsOptional()
  @Matches(SITE_URL_PATTERN, { message: SITE_URL_MESSAGE })
  siteUrl?: string;

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

  /** Пустая строка убирает адрес сайта. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(SITE_URL_PATTERN, { message: SITE_URL_MESSAGE })
  siteUrl?: string;

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
