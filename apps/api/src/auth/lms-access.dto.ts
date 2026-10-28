import type { LmsAccess, LmsRoleProfile } from '@crito/contract';
import { ArrayMaxSize, IsArray } from 'class-validator';

/** Форму групп и ролей проверяет сервис: он же сверяет страницы с БД. */
export class LmsAccessDto implements LmsAccess {
  @IsArray()
  @ArrayMaxSize(100)
  groups: string[];

  @IsArray()
  @ArrayMaxSize(50)
  roles: LmsRoleProfile[];
}
