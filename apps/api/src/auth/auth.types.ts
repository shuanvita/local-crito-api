import type { Grant } from '@crito/contract';
import type { Request } from 'express';

export type { Grant };

export interface Principal {
  /** Внутренний id пользователя (`User.id`). */
  userId: string;
  email: string;
  name?: string;
  isSuperAdmin: boolean;
  grants: Grant[];
  /** Id серверной сессии (`Session.id`); есть только у входа по паролю, нужен для выхода и смены пароля. */
  sessionId?: string;
  /** Вход из LMS по заголовкам nginx: сессии и пароля в CMS нет. */
  viaLms?: boolean;
}

export type AuthedRequest = Request & { principal: Principal };
