import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    StorageModule,
    // Files are buffered in memory so the signature can be checked before
    // anything is written to disk; the size cap is enforced here first.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: configService.get<number>('UPLOAD_MAX_BYTES', 10485760),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
