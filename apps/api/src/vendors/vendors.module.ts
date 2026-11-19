import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorContactsController } from './vendor-contacts.controller';
import { VendorContactsService } from './vendor-contacts.service';
import { VendorAddressesController } from './vendor-addresses.controller';
import { VendorAddressesService } from './vendor-addresses.service';
import { VendorDocumentsController } from './vendor-documents.controller';
import { VendorDocumentsService } from './vendor-documents.service';
import {
  VendorCategoriesController,
  VendorCategoriesService,
} from './vendor-categories.controller';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';

/**
 * Module 1 - Vendor Management.
 *
 * Exports VendorsService so later modules (quotations, purchasing) resolve
 * vendors through `lookup` / `assertSelectableForTransaction` instead of
 * querying the vendor tables with their own rules.
 */
@Module({
  imports: [NumberingModule, DocumentsModule],
  controllers: [
    VendorsController,
    VendorContactsController,
    VendorAddressesController,
    VendorDocumentsController,
    VendorCategoriesController,
  ],
  providers: [
    VendorsService,
    VendorContactsService,
    VendorAddressesService,
    VendorDocumentsService,
    VendorCategoriesService,
  ],
  exports: [VendorsService],
})
export class VendorsModule {}
