import { Module } from '@nestjs/common';
import { EnquiriesController, EnquiryRowsController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { EnquiryChildrenService } from './enquiry-children.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';

/**
 * Module 4 - Enquiry Management. Uses CustomersService and ProductsService
 * to validate references; exports EnquiriesService so Quotation Management
 * can read the hand-off and call markConverted inside its transaction.
 */
@Module({
  imports: [NumberingModule, DocumentsModule, CustomersModule, ProductsModule],
  controllers: [EnquiriesController, EnquiryRowsController],
  providers: [EnquiriesService, EnquiryChildrenService],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
