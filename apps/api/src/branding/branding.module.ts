import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../storage/storage.module';

/** Sign-in page appearance, configured from Settings. */
@Module({
  imports: [DocumentsModule, StorageModule],
  controllers: [BrandingController],
  providers: [BrandingService],
})
export class BrandingModule {}
