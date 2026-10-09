import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { SecretBox } from './secret-box.js';

@Global()
@Module({ providers: [PrismaService, SecretBox], exports: [PrismaService, SecretBox] })
export class CommonModule {}
