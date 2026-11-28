import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Filters for the central audit log. Results are always newest first. */
export class QueryAuditLogsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Exact entity type, e.g. Vendor' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Exact action, e.g. vendor.create. A trailing dot matches every action with that prefix.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'User who made the change' })
  @IsOptional()
  @IsUUID('4')
  actorUserId?: string;

  @ApiPropertyOptional({ description: 'Business date (YYYY-MM-DD), inclusive' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'from must be a date in YYYY-MM-DD format' })
  from?: string;

  @ApiPropertyOptional({ description: 'Business date (YYYY-MM-DD), inclusive' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'to must be a date in YYYY-MM-DD format' })
  to?: string;

  @ApiPropertyOptional({ description: 'Text in the summary' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;
}
