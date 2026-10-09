import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { Public } from '../auth/public.decorator.js';
import { StorageService, isValidKey } from '../storage/storage.service.js';
import { MIME_BY_EXT } from './file-inspector.js';

/**
 * Публичная отдача файлов. Имя файла содержит SHA-256 содержимого, поэтому
 * кэшировать можно навсегда. SVG отдаётся в песочнице: даже при ошибке санитизации скрипты не выполнятся.
 */
@ApiTags('media')
@Public()
@Controller('media')
export class MediaPublicController {
  constructor(private readonly storage: StorageService) {}

  @Get(':project/:file')
  async serve(
    @Param('project') project: string,
    @Param('file') file: string,
    @Res() res: Response,
  ) {
    const key = `${project}/${file}`;
    if (!isValidKey(key)) throw new NotFoundException();

    const ext = file.slice(file.lastIndexOf('.') + 1);
    const mime = MIME_BY_EXT[ext];
    const stream = mime ? await this.storage.get(key) : null;
    if (!mime || !stream) throw new NotFoundException();

    res.set({
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // Сайты на других доменах должны иметь возможность подключать картинки.
      'Cross-Origin-Resource-Policy': 'cross-origin',
      ...(ext === 'svg'
        ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
        : {}),
      ...(ext === 'pdf' ? { 'Content-Disposition': 'inline' } : {}),
    });
    await pipeline(stream, res);
  }
}
