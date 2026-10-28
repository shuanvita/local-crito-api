import type {
  CreateUserRequest,
  Grant,
  LoginRequest,
  UpdateUserRequest,
  UserGrants,
} from '@crito/contract';
import { Transform } from 'class-transformer';
import { IsArray, ArrayMaxSize, IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './password.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class LoginDto implements LoginRequest {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Длину нового пароля не проверяем: проверяется только совпадение, а верхний предел защищает от дорогих запросов. */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}

export class CreateUserDto implements CreateUserRequest {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;
}

export class UpdateUserDto implements UpdateUserRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isSuperAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Форму каждого права (проект, область, страницы) проверяет сервис: он же сверяет их с БД. */
export class UserGrantsDto implements UserGrants {
  @IsArray()
  @ArrayMaxSize(500)
  grants: Grant[];
}
