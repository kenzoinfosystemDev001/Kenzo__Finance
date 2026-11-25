import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [StockService],
  // Exported so later modules (delivery, goods receipt) post into the same
  // ledger instead of writing quantities of their own.
  exports: [StockService],
})
export class StockModule {}
