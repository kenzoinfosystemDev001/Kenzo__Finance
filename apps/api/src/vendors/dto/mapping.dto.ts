import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VendorMappingStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Links a vendor to a brand/company it supplies. */
export class MapVendorCompanyDto {
  @ApiProperty()
  @IsUUID('4', { message: 'companyId must be a valid id' })
  companyId!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Vendor is an authorised partner/distributor for this brand',
  })
  @IsOptional()
  @IsBoolean()
  isAuthorized?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  remarks?: string;
}

export class UpdateVendorCompanyDto {
  @ApiPropertyOptional({ description: 'Vendor is an authorised partner/distributor for this brand' })
  @IsOptional()
  @IsBoolean()
  isAuthorized?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  remarks?: string;
}

/**
 * Links a vendor to a product it supplies.
 *
 * No price field: vendor pricing rules are not confirmed (docs/01_PRD.md 5.2)
 * and a money column must not be invented.
 */
export class MapVendorProductDto {
  @ApiProperty()
  @IsUUID('4', { message: 'productId must be a valid id' })
  productId!: string;

  @ApiPropertyOptional({ description: "Vendor's own part number for this product" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
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
  @Transform(trim)
  remarks?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Specific models of the product this vendor supplies. Omit for the product as a whole.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  modelIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      "Also map the product's brand to the vendor when it is not mapped yet. " +
      'Requires vendor.manage_brands. Without it, an unmapped brand is refused (409).',
  })
  @IsOptional()
  @IsBoolean()
  mapBrand?: boolean;
}

export class UpdateVendorProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  vendorSku?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 3650 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  leadTimeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  remarks?: string;

  @ApiPropertyOptional({ type: [String], description: 'Replaces the set of mapped models. [] = whole product.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  modelIds?: string[];

  @ApiPropertyOptional({ enum: VendorMappingStatus })
  @IsOptional()
  @IsEnum(VendorMappingStatus)
  status?: VendorMappingStatus;
}
