import { Module } from '@nestjs/common';
import { CiKeyGuard, ManifestController } from './manifest.controller.js';
import { ManifestService } from './manifest.service.js';

@Module({
  controllers: [ManifestController],
  providers: [ManifestService, CiKeyGuard],
  exports: [ManifestService],
})
export class ManifestModule {}
