import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VendorAddressType, VendorContactType, VendorStatus } from '@prisma/client';
import { IsGstin, IsPan } from '../../common/validators/tax-id.validators';
import { IsPhone } from '../../common/validators/contact.validators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || undefined : value;

const trimUpper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() || undefined : value;

/** Empty strings from HTML forms mean "not provided", not "invalid". */
const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Domain with optional scheme and path: example.com, https://www.example.co.in/x */
const WEBSITE_PATTERN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?(\/\S*)?$/i;

/** Indian PIN codes are 6 digits; other countries vary, so allow 3-10 chars. */
const POSTAL_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

export const MAX_NESTED_ROWS = 25;

export class VendorContactInputDto {
  @ApiPropertyOptional({ enum: VendorContactType, default: VendorContactType.GENERAL })
  @IsOptional()
  @IsEnum(VendorContactType)
  contactType?: VendorContactType;

  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty({ message: 'Contact name is required' })
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ example: 'Sales Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  designation?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsPhone({ message: 'Contact mobile number is not a valid phone number' })
  @MaxLength(30)
  @Transform(blankToUndefined)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhone({ message: 'Contact alternate mobile number is not a valid phone number' })
  @MaxLength(30)
  @Transform(blankToUndefined)
  alternatePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Contact email must be a valid email address' })
  @MaxLength(200)
  @Transform(trimLower)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Contact alternate email must be a valid email address' })
  @MaxLength(200)
  @Transform(trimLower)
  alternateEmail?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Primary contact for this contact type. Setting it demotes the previous primary of the same type.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(blankToUndefined)
  notes?: string;
}

export class VendorAddressInputDto {
  @ApiPropertyOptional({ enum: VendorAddressType, default: VendorAddressType.OFFICE })
  @IsOptional()
  @IsEnum(VendorAddressType)
  addressType?: VendorAddressType;

  @ApiPropertyOptional({ example: 'Head office', description: 'Optional short label' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  label?: string;

  @ApiProperty({ example: '12, Nehru Place' })
  @IsString()
  @IsNotEmpty({ message: 'Address line 1 is required' })
  @MaxLength(200)
  @Transform(trim)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blankToUndefined)
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'New Delhi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  city?: string;

  @ApiPropertyOptional({ example: 'Delhi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  state?: string;

  @ApiPropertyOptional({ example: '110019' })
  @IsOptional()
  @Matches(POSTAL_CODE_PATTERN, { message: 'PIN / postal code is not valid' })
  @Transform(blankToUndefined)
  postalCode?: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blankToUndefined)
  country?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Primary address. The first address of a vendor is always primary.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateVendorDto {
  // --- Basic information ---------------------------------------------------

  @ApiProperty({ example: 'ABC Technologies' })
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
  @Transform(blankToUndefined)
  legalName?: string;

  @ApiPropertyOptional({
    description: 'VendorCategory id - the vendor type (Manufacturer, Distributor, Dealer...)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Vendor type must be a valid id' })
  @Transform(blankToUndefined)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Company registration number (CIN, LLPIN, Udyam...)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(blankToUndefined)
  registrationNumber?: string;

  @ApiPropertyOptional({
    example: '07ABCDE1234F1Z5',
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

  @ApiPropertyOptional({ example: 'www.abctech.com' })
  @IsOptional()
  @Matches(WEBSITE_PATTERN, { message: 'Website must be a valid address, e.g. www.example.com' })
  @MaxLength(200)
  @Transform(blankToUndefined)
  website?: string;

  @ApiPropertyOptional({ enum: VendorStatus, default: VendorStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @ApiPropertyOptional({ description: 'Vendor description, areas covered, terms discussed' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blankToUndefined)
  notes?: string;

  // --- Company-level communication channels --------------------------------

  @ApiPropertyOptional({ description: 'Company phone (switchboard)' })
  @IsOptional()
  @IsPhone({ message: 'Company phone is not a valid phone number' })
  @MaxLength(30)
  @Transform(blankToUndefined)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhone({ message: 'Company alternate phone is not a valid phone number' })
  @MaxLength(30)
  @Transform(blankToUndefined)
  alternatePhone?: string;

  @ApiPropertyOptional({ description: 'Company email (general inbox)' })
  @IsOptional()
  @IsEmail({}, { message: 'Company email must be a valid email address' })
  @MaxLength(200)
  @Transform(trimLower)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Company alternate email must be a valid email address' })
  @MaxLength(200)
  @Transform(trimLower)
  alternateEmail?: string;

  // --- Nested collections (create only) ------------------------------------

  @ApiPropertyOptional({ type: [VendorContactInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_NESTED_ROWS)
  @ValidateNested({ each: true })
  @Type(() => VendorContactInputDto)
  contacts?: VendorContactInputDto[];

  @ApiPropertyOptional({ type: [VendorAddressInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_NESTED_ROWS)
  @ValidateNested({ each: true })
  @Type(() => VendorAddressInputDto)
  addresses?: VendorAddressInputDto[];

  @ApiPropertyOptional({ type: [String], description: 'Shared Brand (Company) ids this vendor supplies' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  companyIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "Shared Product ids this vendor supplies. Each product's brand is mapped automatically.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  productIds?: string[];

  // --- Workflow flags ------------------------------------------------------

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
