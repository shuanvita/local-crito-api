import { Module } from '@nestjs/common';
import { ManifestModule } from '../manifest/manifest.module.js';
import { PagesModule } from '../pages/pages.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [ManifestModule, PagesModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
