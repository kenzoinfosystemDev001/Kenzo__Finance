import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../storage/storage.module';

/** Background images for the sign-in page, sidebar and workspace (Admin -> Appearance). */
@Module({
  imports: [DocumentsModule, StorageModule],
  controllers: [BrandingController],
  providers: [BrandingService],
})
export class BrandingModule {}
