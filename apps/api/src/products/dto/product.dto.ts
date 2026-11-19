import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class CreateProductDto {
  @ApiProperty({ example: 'Latitude 3540 Business Laptop' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(250)
  @Transform(trim)
  name!: string;

  @ApiProperty({ description: 'Brand/company id' })
  @IsUUID('4', { message: 'companyId must be a valid id' })
  companyId!: string;

  @ApiProperty({ example: 'LAT-3540-I5' })
  @IsString()
  @IsNotEmpty({ message: 'Model number is required' })
  @MaxLength(100)
  @Transform(trim)
  modelNumber!: string;

  @ApiPropertyOptional({ description: 'Design/reference number where applicable' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  designNumber?: string;

  @ApiPropertyOptional({ description: 'Product category id' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional({
    description: 'Free-form technical specifications as key/value pairs',
    example: { processor: 'Intel i5-1335U', ram: '16GB', storage: '512GB SSD' },
  })
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  modelNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  designNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const PRODUCT_SORT_FIELDS = [
  'name',
  'productCode',
  'modelNumber',
  'createdAt',
  'updatedAt',
] as const;

/** Advanced product search (docs/01_PRD.md 5.4). */
export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search across name, code, model and design number',
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  modelNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  designNumber?: string;

  @ApiPropertyOptional({ description: 'Only products supplied by this vendor' })
  @IsOptional()
  @IsUUID('4')
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sortBy: (typeof PRODUCT_SORT_FIELDS)[number] = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override sortDir: 'asc' | 'desc' = 'asc';
}

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
