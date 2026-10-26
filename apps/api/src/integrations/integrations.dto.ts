import type { TelegramChat, UpdateTelegramIntegrationRequest } from '@crito/contract';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Числовой chat_id (у групп с минусом) или @имя публичного канала. */
export const CHAT_ID_PATTERN = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
/** Формат токена от BotFather: номер бота, двоеточие, секретная часть. */
export const BOT_TOKEN_PATTERN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
/** Тот же ключ формы, что принимает приём заявок. */
export const FORM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const MAX_CHATS = 20;
export const MAX_FORMS = 50;

export class TelegramChatDto implements TelegramChat {
  @IsString()
  @Matches(CHAT_ID_PATTERN, { message: 'id чата: число (у групп с минусом) или @имя_канала' })
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title: string | null;
}

export class UpdateTelegramIntegrationDto implements UpdateTelegramIntegrationRequest {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Пустая строка удаляет токен. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Matches(BOT_TOKEN_PATTERN, { message: 'botToken: токен вида 123456:ABC-DEF..., его выдаёт @BotFather' })
  botToken?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHATS)
  @ValidateNested({ each: true })
  @Type(() => TelegramChatDto)
  chats?: TelegramChatDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FORMS)
  @Matches(FORM_KEY_PATTERN, { each: true, message: 'forms: ключ формы из латиницы, цифр, дефиса и подчёркивания' })
  forms?: string[];

  /** Ключи и значения проверяет сервис. */
  @IsOptional()
  @IsObject()
  formLabels?: Record<string, string>;
}
