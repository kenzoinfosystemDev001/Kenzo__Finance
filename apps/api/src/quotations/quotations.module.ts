import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { EnquiriesModule } from '../enquiries/enquiries.module';

/**
 * Module 5 - Quotation Management. Converts enquiries through the Module 4
 * hand-off and exports QuotationsService so the future Proforma Invoice
 * module can read the accepted-revision hand-off.
 */
@Module({
  imports: [NumberingModule, DocumentsModule, CustomersModule, ProductsModule, EnquiriesModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationPdfService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
