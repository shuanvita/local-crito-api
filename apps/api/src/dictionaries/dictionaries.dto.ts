import type { CreateRegionRequest, UpdateRegionRequest } from '@crito/contract';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Предел `Int` в PostgreSQL: идентификаторы регионов приходят из внешней системы. */
const INT_MAX = 2_147_483_647;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRegionDto implements CreateRegionRequest {
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  value: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  sortOrder?: number;
}

export class UpdateRegionDto implements UpdateRegionRequest {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  value?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(INT_MAX)
  sortOrder?: number;
}
