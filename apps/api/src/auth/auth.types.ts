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
}

export type AuthedRequest = Request & { principal: Principal };
