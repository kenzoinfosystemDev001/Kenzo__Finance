import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { NumberingModule } from '../numbering/numbering.module';
import { StockModule } from '../stock/stock.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [NumberingModule, StockModule, DocumentsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
