import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
}
