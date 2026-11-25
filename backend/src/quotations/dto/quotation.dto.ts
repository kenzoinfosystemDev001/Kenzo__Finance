import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { DiscountType, DocumentKind, FollowUpMethod, QuotationStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
/** Money arrives as a string or number; kept as a string so no float rounding happens. */
const money = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value);
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const RATE = /^\d{1,3}(\.\d{1,2})?$/;

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export class QuotationItemInputDto {
  @ApiProperty({ description: 'Existing Product id' })
  @IsUUID('4', { message: 'Select a valid product' })
  productId!: string;

  @ApiPropertyOptional({ description: 'Existing ProductModel id of that product' })
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  productModelId?: string;

  @ApiPropertyOptional({ description: 'Enquiry item this line answers (traceability)' })
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  enquiryItemId?: string;

  @ApiPropertyOptional({ description: 'Description printed on the quotation (defaults to the product description)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(blank)
  description?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1)
  @Max(10_000_000)
  quantity!: number;

  @ApiPropertyOptional({ default: 'Nos' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(blank)
  unit?: string;

  @ApiProperty({ example: '45000.00', description: 'Decimal string, up to 2 places' })
  @Matches(MONEY, { message: 'Unit price must be a number with up to 2 decimals' })
  @Transform(money)
  unitPrice!: string;

  @ApiPropertyOptional({ enum: DiscountType, default: DiscountType.NONE })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional({ example: '5', description: 'Percent or amount depending on discountType' })
  @IsOptional()
  @Matches(MONEY, { message: 'Discount must be a number with up to 2 decimals' })
  @Transform(money)
  discountValue?: string;

  @ApiPropertyOptional({ example: 'GST', description: 'Label for the tax on this line (no rate is assumed)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(blank)
  taxLabel?: string;

  @ApiPropertyOptional({ example: '18', description: 'Tax percentage entered by the user' })
  @IsOptional()
  @Matches(RATE, { message: 'Tax rate must be a percentage with up to 2 decimals' })
  @Transform(money)
  taxRate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(blank)
  remarks?: string;
}

// ---------------------------------------------------------------------------
// Revision content (shared by create, draft update and new revision)
// ---------------------------------------------------------------------------

export class RevisionContentDto {
  @ApiPropertyOptional({ description: 'Defaults to today' })
  @IsOptional()
  @IsDateString()
  quotationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ type: [QuotationItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one item' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuotationItemInputDto)
  items!: QuotationItemInputDto[];

  @ApiPropertyOptional({ example: '0.00', description: 'Flat reduction of the grand total (see calculation notes)' })
  @IsOptional()
  @Matches(MONEY, { message: 'Additional discount must be a number with up to 2 decimals' })
  @Transform(money)
  additionalDiscount?: string;

  @ApiPropertyOptional({ example: 'Freight' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(blank)
  otherChargesLabel?: string;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @Matches(MONEY, { message: 'Other charges must be a number with up to 2 decimals' })
  @Transform(money)
  otherCharges?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) @Transform(blank) termsAndConditions?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) deliveryTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) warrantyTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) @Transform(blank) notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) @Transform(blank) internalRemarks?: string;
}

export class CreateQuotationDto extends RevisionContentDto {
  @ApiPropertyOptional({ description: 'Create from this enquiry (customer and contact come from it)' })
  @IsOptional()
  @IsUUID('4')
  enquiryId?: string;

  @ApiPropertyOptional({ description: 'Required for a manual quotation (no enquiry)' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  assignedToId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) @Transform(blank) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(blank) referenceNumber?: string;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  currency?: string;
}

/** Header fields editable while the current revision is a draft. */
export class UpdateQuotationHeaderDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') contactId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') assignedToId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) @Transform(trim) subject?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(trim) referenceNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  currency?: string;
}

export class UpdateDraftDto extends RevisionContentDto {
  @ApiPropertyOptional({ type: UpdateQuotationHeaderDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateQuotationHeaderDto)
  header?: UpdateQuotationHeaderDto;
}

export class StatusActionDto {
  @ApiProperty({ enum: QuotationStatus })
  @IsEnum(QuotationStatus)
  status!: QuotationStatus;

  @ApiPropertyOptional({ description: 'Required for Rejected and Cancelled, and when sending back from approval' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  remarks?: string;
}

export class CommunicationDto {
  @ApiProperty() @IsDateString() occurredAt!: string;
  @ApiProperty({ enum: FollowUpMethod }) @IsEnum(FollowUpMethod) channel!: FollowUpMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) @Transform(blank) contactName?: string;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Summary is required' }) @MaxLength(4000) @Transform(trim) summary!: string;
}

export class CompareQueryDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) from!: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) to!: number;
}

export const QUOTATION_UPLOAD_KINDS = [DocumentKind.QUOTATION_CUSTOMER_DOCUMENT, DocumentKind.QUOTATION_ATTACHMENT] as const;
export type QuotationUploadKind = (typeof QUOTATION_UPLOAD_KINDS)[number];

export class UploadQuotationDocumentDto {
  @ApiPropertyOptional({ enum: QUOTATION_UPLOAD_KINDS })
  @IsOptional()
  @IsIn(QUOTATION_UPLOAD_KINDS)
  kind?: QuotationUploadKind;
}

export class QuotationSettingsDto {
  @ApiPropertyOptional({ description: 'Default terms copied into new quotations' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  defaultTerms?: string;
}

export class CompanyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) @Transform(trim) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(trim) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @Transform(blank) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) @Transform(trim) gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) @Transform(trim) pan?: string;
}

export const QUOTATION_SORT_FIELDS = ['quotationNumber', 'createdAt', 'currentTotal', 'status', 'updatedAt'] as const;

export class QueryQuotationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Quotation number, customer, enquiry number, product, model or assignee' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;

  @ApiPropertyOptional({ enum: QuotationStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(QuotationStatus, { each: true })
  status?: QuotationStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') assignedToId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') enquiryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMin?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMax?: string;
  @ApiPropertyOptional({ description: 'Only quotations with more than one revision' })
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) revisedOnly?: boolean;

  @ApiPropertyOptional({ enum: QUOTATION_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(QUOTATION_SORT_FIELDS)
  sortBy: (typeof QUOTATION_SORT_FIELDS)[number] = 'createdAt';
}

export class CreateRevisionDto {
  @ApiPropertyOptional({ description: 'Why the revision is being made (shown in the history)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  remarks?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
}
