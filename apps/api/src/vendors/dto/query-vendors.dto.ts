import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VendorStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const toArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return value;
};

/**
 * Sortable list columns. `productCount` and `brandCount` sort by the number
 * of mapped rows (a relation count), the rest by the column itself.
 */
export const VENDOR_SORT_FIELDS = [
  'businessName',
  'vendorCode',
  'contactPerson',
  'phone',
  'email',
  'city',
  'status',
  'productCount',
  'brandCount',
  'createdAt',
  'updatedAt',
] as const;

export type VendorSortField = (typeof VENDOR_SORT_FIELDS)[number];

/**
 * Advanced vendor search (docs/01_PRD.md 5.2).
 *
 * All filtering happens in PostgreSQL. Nothing is filtered in the browser, so
 * results stay correct across pages.
 */
export class QueryVendorsDto extends PaginationQueryDto {
  /** csv (default) or xlsx. Same columns and filters either way. */
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';

  @ApiPropertyOptional({
    description:
      'Free-text search across vendor name, code, GSTIN, company and contact ' +
      'person phone/email/name, city, mapped brand names, and mapped product ' +
      'names and model numbers.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by brand/company name (partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  companyName?: string;

  @ApiPropertyOptional({ description: 'Filter by brand/company id' })
  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @ApiPropertyOptional({ description: 'Filter by product name (partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  productName?: string;

  @ApiPropertyOptional({ description: 'Filter by product model number (partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  modelNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by product id' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Vendor category ids' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  state?: string;

  @ApiPropertyOptional({ enum: VendorStatus })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'Include archived vendors in the results',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ enum: VENDOR_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(VENDOR_SORT_FIELDS)
  sortBy: VendorSortField = 'createdAt';
}
