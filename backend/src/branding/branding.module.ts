import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { BrandLogoService } from './brand-logo.service';

/** Company logo and sign-in page contact, configured from Settings. */
@Module({
  controllers: [BrandingController],
  providers: [BrandingService, BrandLogoService],
})
export class BrandingModule {}
