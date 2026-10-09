import { Module } from '@nestjs/common';
import { MediaPublicController } from './media-public.controller.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  controllers: [MediaController, MediaPublicController],
  providers: [MediaService],
})
export class MediaModule {}
