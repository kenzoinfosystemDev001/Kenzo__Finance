import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DocumentKind, FinalInvoiceStatus, InvoicePaymentState } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { BankDetailsDto } from '../../proforma-invoices/dto/proforma.dto';

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
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** Invoice-specific fields. Commercial values are never accepted: they come from the proforma invoice. */
export class FinalInvoiceDetailsDto {
  @ApiPropertyOptional({ example: '2026-11-20' }) @IsOptional() @IsDateString() invoiceDate?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsUUID('4') contactId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsUUID('4') assignedToId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(300) subject?: string | null;
  @ApiPropertyOptional({ nullable: true, description: "Customer's purchase order number" }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) purchaseOrderNumber?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(4000) internalRemarks?: string | null;
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

export class CreateFinalInvoiceDto extends FinalInvoiceDetailsDto {
  @ApiProperty({ description: 'Issued proforma invoice to bill' })
  @IsUUID('4')
  proformaInvoiceId!: string;
}

export class UpdateFinalInvoiceDto extends FinalInvoiceDetailsDto {}

export const FINAL_INVOICE_ACTION_TARGETS = [
  FinalInvoiceStatus.PENDING_APPROVAL,
  FinalInvoiceStatus.APPROVED,
  FinalInvoiceStatus.DRAFT,
  FinalInvoiceStatus.ISSUED,
  FinalInvoiceStatus.SENT,
  FinalInvoiceStatus.CANCELLED,
] as const;

export class FinalInvoiceStatusDto {
  @ApiProperty({ enum: FINAL_INVOICE_ACTION_TARGETS })
  @IsIn(FINAL_INVOICE_ACTION_TARGETS)
  status!: FinalInvoiceStatus;

  @ApiPropertyOptional({ description: 'Required for cancelling and for sending back from approval' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  remarks?: string;
}

export const FINAL_INVOICE_SORT_FIELDS = ['invoiceNumber', 'invoiceDate', 'dueDate', 'grandTotal', 'status', 'createdAt'] as const;

export class QueryFinalInvoicesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Invoice number, PI number, quotation number, customer, PO number, product, model or employee' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;

  @ApiPropertyOptional({ enum: FinalInvoiceStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(FinalInvoiceStatus, { each: true })
  status?: FinalInvoiceStatus[];

  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') proformaInvoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') assignedToId?: string;
  @ApiPropertyOptional({ description: 'Invoice date from' }) @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional({ description: 'Invoice date to' }) @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional({ description: 'Due date from' }) @IsOptional() @IsDateString() dueFrom?: string;
  @ApiPropertyOptional({ description: 'Due date to' }) @IsOptional() @IsDateString() dueTo?: string;
  @ApiPropertyOptional({ enum: InvoicePaymentState, isArray: true, description: 'Comma-separated; derived from verified payments' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(InvoicePaymentState, { each: true })
  paymentState?: InvoicePaymentState[];
  @ApiPropertyOptional({ description: 'Issued, not fully paid invoices whose due date has passed' })
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() pastDueOnly?: boolean;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMin?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMax?: string;

  @ApiPropertyOptional({ enum: FINAL_INVOICE_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(FINAL_INVOICE_SORT_FIELDS)
  sortBy: (typeof FINAL_INVOICE_SORT_FIELDS)[number] = 'createdAt';
}

export class EligibleProformasQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'PI number, quotation number or customer' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
}

export class InvoiceNumberingDto {
  @ApiProperty({ example: 'KI/INV/' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9/-]+$/, { message: 'The prefix may contain letters, digits, "/" and "-" only' })
  prefix!: string;

  @ApiProperty({ minimum: 1, maximum: 10 }) @Type(() => Number) @IsInt() @Min(1) @Max(10) padding!: number;
  @ApiProperty() @IsBoolean() financialYear!: boolean;
  @ApiProperty({ minimum: 1, maximum: 12, description: '4 = April' }) @Type(() => Number) @IsInt() @Min(1) @Max(12) fyStartMonth!: number;
}

export const FINAL_INVOICE_UPLOAD_KINDS = [DocumentKind.FINAL_INVOICE_ATTACHMENT] as const;

export class UploadFinalInvoiceDocumentDto {
  @ApiPropertyOptional({ enum: FINAL_INVOICE_UPLOAD_KINDS })
  @IsOptional()
  @IsIn(FINAL_INVOICE_UPLOAD_KINDS)
  kind?: (typeof FINAL_INVOICE_UPLOAD_KINDS)[number];
}
