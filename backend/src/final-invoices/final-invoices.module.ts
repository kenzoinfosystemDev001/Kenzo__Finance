import { Module } from '@nestjs/common';
import { FinalInvoicesController } from './final-invoices.controller';
import { FinalInvoicesService } from './final-invoices.service';
import { FinalInvoicePdfService } from './final-invoice-pdf.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';
import { CustomersModule } from '../customers/customers.module';
import { EnquiriesModule } from '../enquiries/enquiries.module';
import { QuotationsModule } from '../quotations/quotations.module';

/**
 * Module 7 - Final Invoice Management. Raises the customer invoice from an
 * issued proforma invoice (Module 6) and exports FinalInvoicesService so
 * Payment Management can use paymentHandoff().
 */
@Module({
  imports: [NumberingModule, DocumentsModule, CustomersModule, EnquiriesModule, QuotationsModule],
  controllers: [FinalInvoicesController],
  providers: [FinalInvoicesService, FinalInvoicePdfService],
  exports: [FinalInvoicesService],
})
export class FinalInvoicesModule {}
