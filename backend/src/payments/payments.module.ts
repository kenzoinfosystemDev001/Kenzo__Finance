import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';
import { EnquiriesModule } from '../enquiries/enquiries.module';

/**
 * Module 8 - Payment Management: money received against final invoices
 * (Module 7). The single source of truth for each invoice's received amount,
 * outstanding balance and payment state.
 */
@Module({
  imports: [NumberingModule, DocumentsModule, EnquiriesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentReceiptService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
