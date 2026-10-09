import { Module } from '@nestjs/common';
import { ManifestModule } from '../manifest/manifest.module.js';
import { PagesController } from './pages.controller.js';
import { PagesService } from './pages.service.js';
import { RevalidateService } from './revalidate.service.js';

@Module({
  imports: [ManifestModule],
  controllers: [PagesController],
  providers: [PagesService, RevalidateService],
})
export class PagesModule {}
