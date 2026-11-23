import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RANKING_SORTS, RANKING_VIEWS, type RankingSort, type RankingView } from '../customer-rankings';

export class CustomerRankingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RANKING_VIEWS, default: 'all' })
  @IsOptional()
  @IsIn(RANKING_VIEWS)
  view: RankingView = 'all';

  @ApiPropertyOptional({ enum: RANKING_SORTS, default: 'invoiced' })
  @IsOptional()
  @IsIn(RANKING_SORTS)
  sortBy: RankingSort = 'invoiced';

  @ApiPropertyOptional({ description: 'Customer name or code' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class SetFavouriteDto {
  @IsBoolean()
  isFavourite!: boolean;
}
