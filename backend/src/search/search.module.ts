import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Header search across modules (permission-scoped). */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
