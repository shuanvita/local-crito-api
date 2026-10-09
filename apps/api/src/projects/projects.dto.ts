import type { CreateProjectRequest, UpdateProjectRequest } from '@crito/contract';
import { IsOptional, IsString, IsUrl, Matches, MinLength, ValidateIf } from 'class-validator';

export class CreateProjectDto implements CreateProjectRequest {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*$/, { message: 'slug: строчные латинские буквы, цифры и дефис' })
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

  /** Новый секрет вебхука; пустая строка удаляет секрет. */
  @IsOptional()
  @IsString()
  revalidateSecret?: string;
}
