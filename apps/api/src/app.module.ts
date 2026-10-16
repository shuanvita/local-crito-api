import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { DictionariesModule } from './dictionaries/dictionaries.module.js';
import { HealthController } from './health/health.controller.js';
import { validateEnvironment } from './config/env.js';
import { MediaModule } from './media/media.module.js';
import { ManifestModule } from './manifest/manifest.module.js';
import { PagesModule } from './pages/pages.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StorageModule } from './storage/storage.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { PublicController, PublicDictionariesController } from './public/public.controller.js';

@Module({
  imports: [
    // `.env` ищется в текущей папке и рядом с приложением (apps/api/.env): так CLI запускается откуда угодно.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', join(import.meta.dirname, '..', '.env')],
      validate: validateEnvironment,
    }),
    CommonModule,
    StorageModule,
    AuthModule,
    ProjectsModule,
    ManifestModule,
    PagesModule,
    SettingsModule,
    DictionariesModule,
    MediaModule,
    RequestsModule,
  ],
  controllers: [PublicDictionariesController, PublicController, HealthController],
})
export class AppModule {}
