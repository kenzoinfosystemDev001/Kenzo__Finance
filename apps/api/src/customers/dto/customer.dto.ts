import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CustomerAddressType, CustomerStatus, CustomerType, DocumentKind } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IsGstin, IsPan } from '../../common/validators/tax-id.validators';
import { IsPhone } from '../../common/validators/contact.validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || undefined : value;
const upperNoSpace = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() || undefined : value;
const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const WEBSITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?(\/\S*)?$/i;
const POSTAL = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

export const MAX_ROWS = 25;

// ---------------------------------------------------------------------------
// Contacts and addresses
// ---------------------------------------------------------------------------

export class CustomerContactInputDto {
  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @IsNotEmpty({ message: 'Contact name is required' })
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ example: 'Business Head' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  designation?: string;

  @ApiPropertyOptional({ example: 'Procurement' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Contact email must be a valid email address' })
  @MaxLength(200)
  @Transform(lower)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhone({ message: 'Contact phone is not a valid phone number' })
  @MaxLength(30)
  @Transform(blank)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhone({ message: 'Alternate phone is not a valid phone number' })
  @MaxLength(30)
  @Transform(blank)
  alternatePhone?: string;

  @ApiPropertyOptional({ description: 'Exactly one primary contact per customer; setting it demotes the previous one.' })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CustomerAddressInputDto {
  @ApiProperty({ enum: CustomerAddressType })
  @IsEnum(CustomerAddressType, { message: 'Select a valid address type' })
  addressType!: CustomerAddressType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Address line 1 is required' })
  @MaxLength(200)
  @Transform(trim)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blank)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(POSTAL, { message: 'Postal code is not valid' })
  @Transform(blank)
  postalCode?: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  country?: string;

  @ApiPropertyOptional({ description: 'Default address of its type (one default billing, one default shipping, ...)' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateCustomerContactDto extends PartialType(CustomerContactInputDto) {}
export class UpdateCustomerAddressDto extends PartialType(CustomerAddressInputDto) {}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export class CreateCustomerDto {
  @ApiProperty({ enum: CustomerType })
  @IsEnum(CustomerType, { message: 'Select Individual or Business' })
  customerType!: CustomerType;

  @ApiProperty({ example: 'ABC Pvt. Ltd.' })
  @IsString()
  @IsNotEmpty({ message: 'Customer name is required' })
  @MinLength(2, { message: 'Customer name must be at least 2 characters' })
  @MaxLength(200)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ description: 'CustomerCategory id' })
  @IsOptional()
  @IsUUID('4', { message: 'Select a valid category' })
  @Transform(blank)
  categoryId?: string;

  @ApiPropertyOptional({ example: 'IT & Technology' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(WEBSITE, { message: 'Website must be a valid address, e.g. www.example.com' })
  @MaxLength(200)
  @Transform(blank)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  description?: string;

  @ApiPropertyOptional({ enum: CustomerStatus, default: CustomerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  // --- Registration & tax --------------------------------------------------

  @ApiPropertyOptional({ default: 'India', description: 'Tax jurisdiction; Indian identifiers apply only to India' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  taxCountry?: string;

  @ApiPropertyOptional({ description: 'Indian GSTIN (checksum verified)' })
  @IsOptional()
  @IsGstin()
  @Transform(upperNoSpace)
  gstin?: string;

  @ApiPropertyOptional({ description: 'Indian PAN' })
  @IsOptional()
  @IsPan()
  @Transform(upperNoSpace)
  pan?: string;

  @ApiPropertyOptional({ description: 'Indian Corporate Identification Number (business customers)' })
  @IsOptional()
  @Matches(/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, { message: 'CIN must be 21 characters, e.g. U72200DL2010PTC123456' })
  @Transform(upperNoSpace)
  cin?: string;

  @ApiPropertyOptional({ description: 'VAT / tax number for customers outside India' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$/, { message: 'Tax registration number may contain letters, digits, spaces, ".", "/" and "-"' })
  @Transform(blank)
  taxRegistrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(blank)
  otherRegistration?: string;

  // --- Business profile ----------------------------------------------------

  @ApiPropertyOptional({ example: '51-200' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(blank)
  companySize?: string;

  @ApiPropertyOptional({ example: 'Private Limited' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(blank)
  businessType?: string;

  @ApiPropertyOptional({ example: '10-50 Cr' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(blank)
  annualTurnoverRange?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  employeeCount?: number;

  // --- Nested (create only) ------------------------------------------------

  @ApiPropertyOptional({ type: [CustomerContactInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CustomerContactInputDto)
  contacts?: CustomerContactInputDto[];

  @ApiPropertyOptional({ type: [CustomerAddressInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CustomerAddressInputDto)
  addresses?: CustomerAddressInputDto[];

  @ApiPropertyOptional({ default: false, description: 'Acknowledge a possible-duplicate warning and create anyway' })
  @IsOptional()
  @IsBoolean()
  confirmPossibleDuplicate?: boolean;
}

/** Scalars only; send null to clear. Status, contacts and addresses have their own endpoints. */
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['contacts', 'addresses', 'confirmPossibleDuplicate', 'status'] as const),
) {}

export class CustomerStatusDto {
  @ApiProperty({ enum: CustomerStatus })
  @IsEnum(CustomerStatus)
  status!: CustomerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(blank)
  reason?: string;
}

// ---------------------------------------------------------------------------
// Products of interest
// ---------------------------------------------------------------------------

export class AddProductInterestDto {
  @ApiProperty()
  @IsUUID('4', { message: 'Select a valid product' })
  productId!: string;

  @ApiPropertyOptional({ type: [String], description: 'Specific models; omit for interest in the product generally' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  modelIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(blank)
  notes?: string;
}

export class UpdateProductInterestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  notes?: string;
}

// ---------------------------------------------------------------------------
// Categories, documents, query
// ---------------------------------------------------------------------------

export class CustomerCategoryDto {
  @ApiProperty()
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

export class UpdateCustomerCategoryDto extends PartialType(CustomerCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const CUSTOMER_DOCUMENT_KINDS = [
  DocumentKind.CUSTOMER_GST_CERTIFICATE,
  DocumentKind.CUSTOMER_PAN,
  DocumentKind.CUSTOMER_REGISTRATION_CERTIFICATE,
  DocumentKind.CUSTOMER_AGREEMENT,
  DocumentKind.CUSTOMER_PURCHASE_AUTHORIZATION,
  DocumentKind.CUSTOMER_OTHER,
] as const;
export type CustomerDocumentKind = (typeof CUSTOMER_DOCUMENT_KINDS)[number];

export class UploadCustomerDocumentDto {
  @ApiPropertyOptional({ enum: CUSTOMER_DOCUMENT_KINDS })
  @IsOptional()
  @IsIn(CUSTOMER_DOCUMENT_KINDS, { message: 'Unknown customer document type' })
  kind?: CustomerDocumentKind;
}

export const CUSTOMER_SORT_FIELDS = ['customerCode', 'name', 'customerType', 'status', 'createdAt', 'updatedAt'] as const;

export class QueryCustomersDto extends PaginationQueryDto {
  /** csv (default) or xlsx. Same columns and filters either way. */
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'] })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';

  @ApiPropertyOptional({
    description: 'Name, code, contact name/phone/email, GSTIN, PAN, city or country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ enum: CustomerType })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  industry?: string;

  @ApiPropertyOptional({ enum: CustomerStatus })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({ description: 'Any address in this country' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  country?: string;

  @ApiPropertyOptional({ description: 'Any address in this state' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  state?: string;

  @ApiPropertyOptional({ description: 'Customers interested in this product' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS)
  sortBy: (typeof CUSTOMER_SORT_FIELDS)[number] = 'createdAt';
}

export class CustomerLookupQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blank)
  search?: string;

  @ApiPropertyOptional({ description: 'Include inactive customers (shown, flagged)' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeInactive?: boolean;
}
