import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { LocalStorage, resolveStorageDir } from './local.storage.js';
import { StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'local';
        if (driver === 'local') {
          // src/storage или dist/storage -> корень приложения apps/api
          return new LocalStorage(resolveStorageDir(config.get<string>('STORAGE_LOCAL_DIR'), join(import.meta.dirname, '..', '..')));
        }
        throw new Error(`Неизвестный STORAGE_DRIVER: ${driver}`);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
