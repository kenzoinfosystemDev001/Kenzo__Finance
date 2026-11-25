import { Module } from '@nestjs/common';
import { CustomerRankingsService } from './customer-rankings.service';
import { CustomerRowsController, CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerChildrenService } from './customer-children.service';
import { NumberingModule } from '../numbering/numbering.module';
import { DocumentsModule } from '../documents/documents.module';

/**
 * Module 3 - Customer Management. The single customer master for later
 * modules, which use CustomersService.lookup / assertSelectableForTransaction
 * and reference customers.id. Products of interest point at Module 2's
 * products and models; no catalogue data is copied.
 */
@Module({
  imports: [NumberingModule, DocumentsModule],
  controllers: [CustomersController, CustomerRowsController],
  providers: [CustomersService, CustomerChildrenService, CustomerRankingsService],
  exports: [CustomersService],
})
export class CustomersModule {}
