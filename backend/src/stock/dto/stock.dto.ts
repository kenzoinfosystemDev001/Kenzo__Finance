import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

/**
 * A stock movement request.
 *
 * `quantity` is always a positive magnitude; the movement TYPE decides the
 * sign. Letting the caller send a signed number invites an "ISSUE of +10"
 * that silently increases stock.
 */
export class CreateStockMovementDto {
  @ApiProperty({ enum: StockMovementType })
  @IsEnum(StockMovementType, { message: 'Unknown stock movement type' })
  type!: StockMovementType;

  @ApiProperty({ minimum: 1, description: 'Positive whole units' })
  @IsInt({ message: 'Quantity must be a whole number of units' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(10_000_000)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Defaults to the default location' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Required for adjustments, which have no source document.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  reason?: string;

  @ApiPropertyOptional({ description: 'When the movement physically happened' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export const MOVEMENT_SORT_FIELDS = ['occurredAt', 'createdAt'] as const;

export class QueryStockMovementsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_SORT_FIELDS, default: 'occurredAt' })
  @IsOptional()
  @IsIn(MOVEMENT_SORT_FIELDS)
  sortBy: (typeof MOVEMENT_SORT_FIELDS)[number] = 'occurredAt';
}

export class QueryStockBalancesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search product name, code or model' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Only products at or below their reorder level',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  lowStockOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only products with zero on-hand' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  outOfStockOnly?: boolean;
}

export class CreateStockLocationDto {
  @ApiProperty({ example: 'Main Store' })
  @IsString()
  @IsNotEmpty({ message: 'Location name is required' })
  @MaxLength(120)
  @Transform(trim)
  name!: string;

  @ApiProperty({ example: 'MAIN' })
  @IsString()
  @IsNotEmpty({ message: 'Location code is required' })
  @MaxLength(20)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  address?: string;
}
