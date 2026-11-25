import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

/** Product sales analytics and history. Read-only over final invoices; no sales copy is kept. */
@Module({
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
