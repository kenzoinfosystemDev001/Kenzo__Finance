import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorContactsController } from './vendor-contacts.controller';
import { VendorContactsService } from './vendor-contacts.service';
import {
  VendorCategoriesController,
  VendorCategoriesService,
} from './vendor-categories.controller';
import { NumberingModule } from '../numbering/numbering.module';

@Module({
  imports: [NumberingModule],
  controllers: [
    VendorsController,
    VendorContactsController,
    VendorCategoriesController,
  ],
  providers: [VendorsService, VendorContactsService, VendorCategoriesService],
  exports: [VendorsService],
})
export class VendorsModule {}
