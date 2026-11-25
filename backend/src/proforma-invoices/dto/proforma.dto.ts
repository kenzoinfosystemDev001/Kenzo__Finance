import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { DocumentKind, ProformaStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty string -> null so an optional field can be cleared on edit. */
const nullable = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const blank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
const money = ({ value }: { value: unknown }) => {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  return value;
};
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Bank account printed on a PI. Entered by an administrator in Settings (and
 * adjustable on a draft); never invented by the system.
 */
export class BankDetailsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) @Transform(trim) bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) @Transform(trim) accountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) @Matches(/^[A-Za-z0-9 -]*$/, { message: 'Account number may contain letters, digits, spaces and hyphens' }) @Transform(trim) accountNumber?: string;
  @ApiPropertyOptional({ description: 'IFSC (India)' }) @IsOptional() @IsString() @MaxLength(20) @Matches(/^([A-Z]{4}0[A-Z0-9]{6})?$/, { message: 'IFSC must look like ABCD0123456' }) @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) ifsc?: string;
  @ApiPropertyOptional({ description: 'SWIFT / BIC' }) @IsOptional() @IsString() @MaxLength(20) @Matches(/^([A-Z0-9]{8}|[A-Z0-9]{11})?$/, { message: 'SWIFT/BIC must be 8 or 11 letters/digits' }) @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) swift?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) branch?: string;
}

/** PI-specific fields. Commercial values are never accepted: they come from the accepted revision. */
export class ProformaDetailsDto {
  @ApiPropertyOptional({ example: '2026-11-20' }) @IsOptional() @IsDateString() piDate?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsUUID('4') contactId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsUUID('4') assignedToId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) subject?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) referenceNumber?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) internalRemarks?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Amount requested in advance (not more than the grand total)' })
  @IsOptional()
  @Transform(money)
  @Matches(MONEY, { message: 'Advance amount must be a number with up to 2 decimals' })
  advanceAmount?: string | null;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) paymentTerms?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) deliveryTerms?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) warrantyTerms?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(8000) termsAndConditions?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) notes?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) paymentInstructions?: string | null;

  @ApiPropertyOptional({ type: BankDetailsDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto | null;
}

export class CreateProformaDto extends ProformaDetailsDto {
  @ApiProperty({ description: 'Quotation whose accepted revision becomes the PI' })
  @IsUUID('4')
  quotationId!: string;
}

export class UpdateProformaDto extends ProformaDetailsDto {}

/** Targets reachable through the status endpoint. */
export const PROFORMA_ACTION_TARGETS = [
  ProformaStatus.PENDING_APPROVAL,
  ProformaStatus.APPROVED,
  ProformaStatus.DRAFT,
  ProformaStatus.ISSUED,
  ProformaStatus.SENT,
  ProformaStatus.CANCELLED,
] as const;

export class ProformaStatusDto {
  @ApiProperty({ enum: PROFORMA_ACTION_TARGETS })
  @IsIn(PROFORMA_ACTION_TARGETS)
  status!: ProformaStatus;

  @ApiPropertyOptional({ description: 'Required for cancelling and for sending back from approval' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  remarks?: string;
}

export const PROFORMA_SORT_FIELDS = ['piNumber', 'piDate', 'grandTotal', 'status', 'createdAt', 'dueDate'] as const;

export class QueryProformasDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'PI number, customer, quotation number, product, model or employee' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;

  @ApiPropertyOptional({ enum: ProformaStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(ProformaStatus, { each: true })
  status?: ProformaStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') quotationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') assignedToId?: string;
  @ApiPropertyOptional({ description: 'PI date from' }) @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional({ description: 'PI date to' }) @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMin?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMax?: string;

  @ApiPropertyOptional({ enum: PROFORMA_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(PROFORMA_SORT_FIELDS)
  sortBy: (typeof PROFORMA_SORT_FIELDS)[number] = 'createdAt';
}

export class EligibleQuotationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Quotation number or customer' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
}

export class ProformaSettingsDto {
  @ApiPropertyOptional({ type: BankDetailsDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(nullable)
  @IsString()
  @MaxLength(4000)
  paymentInstructions?: string | null;
}

export const PROFORMA_UPLOAD_KINDS = [DocumentKind.PROFORMA_ATTACHMENT] as const;

export class UploadProformaDocumentDto {
  @ApiPropertyOptional({ enum: PROFORMA_UPLOAD_KINDS })
  @IsOptional()
  @IsIn(PROFORMA_UPLOAD_KINDS)
  kind?: (typeof PROFORMA_UPLOAD_KINDS)[number];
}
