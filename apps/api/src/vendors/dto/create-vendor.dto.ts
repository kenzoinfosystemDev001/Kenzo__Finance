import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VendorStatus } from '@prisma/client';
import { IsGstin, IsPan } from '../../common/validators/tax-id.validators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value;

export class VendorContactInputDto {
  @ApiProperty({ example: 'Ramesh Gupta' })
  @IsString()
  @IsNotEmpty({ message: 'Contact name is required' })
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ example: 'Sales Head' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  designation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Contact email must be a valid email address' })
  @Transform(trimLower)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(trim)
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  notes?: string;
}

export class CreateVendorDto {
  @ApiProperty({ example: 'Shree Computers Pvt Ltd' })
  @IsString()
  @IsNotEmpty({ message: 'Vendor name is required' })
  @MinLength(2, { message: 'Vendor name must be at least 2 characters' })
  @MaxLength(200)
  @Transform(trim)
  businessName!: string;

  @ApiPropertyOptional({ description: 'Registered legal name, if different' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(trim)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(200)
  @Transform(trimLower)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(trim)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(trim)
  alternatePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trim)
  postalCode?: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  country?: string;

  @ApiPropertyOptional({
    example: '29ABCDE1234F1Z5',
    description: '15-character GSTIN. Checksum is verified.',
  })
  @IsOptional()
  @IsGstin()
  @Transform(trimUpper)
  gstin?: string;

  @ApiPropertyOptional({ example: 'ABCDE1234F' })
  @IsOptional()
  @IsPan()
  @Transform(trimUpper)
  pan?: string;

  @ApiPropertyOptional({ description: 'VendorCategory id' })
  @IsOptional()
  @IsUUID('4', { message: 'categoryId must be a valid id' })
  categoryId?: string;

  @ApiPropertyOptional({ enum: VendorStatus, default: VendorStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  notes?: string;

  @ApiPropertyOptional({ type: [VendorContactInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorContactInputDto)
  contacts?: VendorContactInputDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Company/brand ids this vendor supplies',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyIds?: string[];

  @ApiPropertyOptional({
    description:
      'Set when the vendor is created from a reviewed OCR draft. Links the ' +
      'OCR job to the created vendor and marks the draft consumed.',
  })
  @IsOptional()
  @IsUUID('4')
  ocrJobId?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Acknowledges a reported possible-duplicate warning and creates the ' +
      'vendor anyway. Ignored when no duplicate is detected.',
  })
  @IsOptional()
  @IsBoolean()
  confirmPossibleDuplicate?: boolean;
}
