import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Principal } from '../auth/auth.types.js';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import { MAX_UPLOAD_BYTES } from './file-inspector.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@ApiBearerAuth()
@Controller('projects/:project/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.media.upload(principal, project, file);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Query('search') search?: string,
  ) {
    return this.media.list(principal, project, search);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('project') project: string,
    @Param('id') id: string,
  ) {
    return this.media.remove(principal, project, id);
  }
}
