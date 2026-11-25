import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductModelsService } from './product-models.service';
import { ProductDocumentsService } from './product-documents.service';
import { ProductDocumentsController, ProductModelsController } from './product-children.controller';
import { NumberingModule } from '../numbering/numbering.module';
import { StockModule } from '../stock/stock.module';
import { DocumentsModule } from '../documents/documents.module';
import { VendorsModule } from '../vendors/vendors.module';

/**
 * Module 2 - Product Management (catalogue, models, vendor associations).
 * Uses the shared Brand master and VendorsService for vendor mappings; it
 * owns no vendor or brand data of its own. Exports ProductsService so later
 * modules use `lookup` / `assertSelectableForTransaction`.
 */
@Module({
  imports: [NumberingModule, StockModule, DocumentsModule, VendorsModule],
  controllers: [ProductsController, ProductModelsController, ProductDocumentsController],
  providers: [ProductsService, ProductModelsService, ProductDocumentsService],
  exports: [ProductsService],
})
export class ProductsModule {}
