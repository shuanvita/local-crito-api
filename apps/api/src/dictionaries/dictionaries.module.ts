import { Module } from '@nestjs/common';
import { PagesModule } from '../pages/pages.module.js';
import { DictionariesController } from './dictionaries.controller.js';
import { DictionariesService } from './dictionaries.service.js';

@Module({
  // RevalidateService живёт в модуле страниц: вебхук у проекта один, и у справочников тот же.
  imports: [PagesModule],
  controllers: [DictionariesController],
  providers: [DictionariesService],
})
export class DictionariesModule {}
