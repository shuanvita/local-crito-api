import type { SiteSettings, UpdateSettingsRequest } from '@crito/contract';
import { IsObject } from 'class-validator';

export class UpdateSettingsDto implements UpdateSettingsRequest {
  /** Форма задана `settingsSchema` манифеста и проверяется там, а не здесь. */
  @IsObject()
  settings: SiteSettings;
}
