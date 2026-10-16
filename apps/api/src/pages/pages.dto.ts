import type {
  ContentBlock,
  ContentPageMeta,
  CreatePageRequest,
  PageContent,
  PageHeader,
  PublishPageRequest,
  UpdatePageRequest,
} from '@crito/contract';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BlockDto implements ContentBlock {
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  @MinLength(1)
  type: string;

  @IsInt()
  order: number;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  anchor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  schemaVersion?: number;

  /** Содержимое блока проверяется по JSON Schema из манифеста, а не здесь. */
  @IsDefined()
  data: unknown;
}

export class PageMetaDto implements ContentPageMeta {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() ogTitle?: string;
  @IsOptional() @IsString() ogDescription?: string;
  @IsOptional() @IsString() ogImage?: string;
}

class PageContentDto implements PageContent {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlockDto)
  blocks: BlockDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PageMetaDto)
  meta?: PageMetaDto;

  /** Шапка страницы: форма задана `headerSchema` манифеста и проверяется там, а не здесь. */
  @IsOptional()
  @IsObject()
  header?: PageHeader;

  @IsOptional()
  @IsBoolean()
  noFooterSpacing?: boolean;
}

export class CreatePageDto extends PageContentDto implements CreatePageRequest {
  @IsString()
  slug: string;
}

export class UpdatePageDto extends PageContentDto implements UpdatePageRequest {
  /** Опубликованная версия, на которой основаны правки. Если страницу успели опубликовать, придёт 409. */
  @IsInt()
  @Min(1)
  version: number;
}

export class PublishPageDto implements PublishPageRequest {
  @IsInt()
  @Min(1)
  version: number;
}
