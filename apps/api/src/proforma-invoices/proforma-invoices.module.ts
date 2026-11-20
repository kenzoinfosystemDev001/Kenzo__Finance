import { Module } from '@nestjs/common';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicesService } from './proforma-invoices.service';
import { ProformaPdfService } from './proforma-pdf.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';
import { CustomersModule } from '../customers/customers.module';
import { EnquiriesModule } from '../enquiries/enquiries.module';
import { QuotationsModule } from '../quotations/quotations.module';

/**
 * Module 6 - Proforma Invoice Management. Raises PIs from the accepted
 * revision of a quotation (Module 5) and exports ProformaInvoicesService so
 * Payment Management (Module 7) can use paymentHandoff().
 */
@Module({
  imports: [NumberingModule, DocumentsModule, CustomersModule, EnquiriesModule, QuotationsModule],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService, ProformaPdfService],
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
