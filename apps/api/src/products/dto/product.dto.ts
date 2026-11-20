import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Empty strings from HTML forms mean "not provided". */
const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

// ---------------------------------------------------------------------------
// Specifications: an ordered list of name/value pairs, so every category can
// carry its own attributes (laptop: Processor, RAM; switch: Ports, PoE).
// ---------------------------------------------------------------------------

export class SpecificationDto {
  @ApiProperty({ example: 'Processor' })
  @IsString()
  @IsNotEmpty({ message: 'Specification name is required' })
  @MaxLength(80)
  @Transform(trim)
  name!: string;

  @ApiProperty({ example: 'Intel Core Ultra 5 125U' })
  @IsString()
  @IsNotEmpty({ message: 'Specification value is required' })
  @MaxLength(500)
  @Transform(trim)
  value!: string;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export class CreateProductModelDto {
  @ApiProperty({ example: 'Latitude 5450' })
  @IsString()
  @IsNotEmpty({ message: 'Model name is required' })
  @MaxLength(200)
  @Transform(trim)
  modelName!: string;

  @ApiProperty({ example: 'LAT-5450-U5' })
  @IsString()
  @IsNotEmpty({ message: 'Model number is required' })
  @MaxLength(100)
  @Transform(trim)
  modelNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blankToUndefined)
  description?: string;

  @ApiPropertyOptional({ type: [SpecificationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60, { message: 'A model may have at most 60 specifications' })
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductModelDto extends PartialType(OmitType(CreateProductModelDto, ['isActive'] as const)) {}

export class StatusDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Kept in the activity history' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(blankToUndefined)
  reason?: string;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export class CreateProductDto {
  @ApiProperty({ example: 'Dell Latitude Laptop' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(250)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ description: 'Business SKU. Unique when given; the product code is generated.' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/, {
    message: 'SKU may contain letters, digits, ".", "_", "/" and "-" (max 60 characters)',
  })
  @Transform(blankToUndefined)
  sku?: string;

  @ApiProperty({ description: 'Shared brand (company) id' })
  @IsUUID('4', { message: 'Select a valid brand' })
  companyId!: string;

  @ApiPropertyOptional({ description: 'Product category id' })
  @IsOptional()
  @IsUUID('4', { message: 'Select a valid category' })
  @Transform(blankToUndefined)
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blankToUndefined)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [CreateProductModelDto],
    description: 'Models created in the same transaction. More can be added later.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProductModelDto)
  models?: CreateProductModelDto[];

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Low-stock threshold. Only meaningful when stock tracking is enabled.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  reorderLevel?: number;
}

/**
 * Every field optional; send null to clear. Models, status and images have
 * their own endpoints so each change is validated and audited separately.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['models', 'isActive'] as const),
) {}

export class MapProductVendorDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Select a valid vendor' })
  vendorId!: string;

  @ApiPropertyOptional({ type: [String], description: 'Specific models; omit for the whole product' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  modelIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  vendorSku?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  leadTimeDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(blankToUndefined)
  remarks?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Also map the brand to the vendor if missing (needs vendor.manage_brands)',
  })
  @IsOptional()
  @IsBoolean()
  mapBrand?: boolean;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export class CreateProductCategoryDto {
  @ApiProperty({ example: 'Laptops' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;
}

export class UpdateProductCategoryDto {
  @ApiPropertyOptional()
  // Validated whenever present, so `null` or a blank name is a 400.
  @ValidateIf((o: UpdateProductCategoryDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export const PRODUCT_SORT_FIELDS = [
  'name',
  'productCode',
  'isActive',
  'modelCount',
  'vendorCount',
  'createdAt',
  'updatedAt',
] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

/** Product search. All filtering runs in PostgreSQL and filters combine. */
export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Free text across product name, code, SKU, brand, model name/number/code and mapped vendor name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @ApiPropertyOptional({ description: 'Brand name (partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(trim)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Model number or name (partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  modelNumber?: string;

  @ApiPropertyOptional({ description: 'Only products supplied by this vendor' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Created on or after (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'createdFrom must be a date' })
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Created on or before (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @IsDateString({}, { message: 'createdTo must be a date' })
  createdTo?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ description: 'Only products at or below their reorder level' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  lowStockOnly?: boolean;

  @ApiPropertyOptional({ description: 'Only products with zero on-hand' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  outOfStockOnly?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sortBy: ProductSortField = 'createdAt';
}

export class ProductLookupQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blankToUndefined)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @ApiPropertyOptional({ description: 'Only products this vendor supplies' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;
}
