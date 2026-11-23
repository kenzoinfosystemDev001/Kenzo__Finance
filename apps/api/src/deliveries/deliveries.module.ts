import { Module } from '@nestjs/common';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryPdfService } from './delivery-pdf.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [NumberingModule, DocumentsModule],
  controllers:[DeliveriesController],
  providers:[DeliveriesService,DeliveryPdfService],
  exports:[DeliveriesService],
})
export class DeliveriesModule {}
