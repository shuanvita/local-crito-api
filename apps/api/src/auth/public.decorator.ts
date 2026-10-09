import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Открывает эндпоинт без сессии. По умолчанию закрыто всё. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
