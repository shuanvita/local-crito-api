import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './auth.types.js';

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthedRequest>().principal,
);
