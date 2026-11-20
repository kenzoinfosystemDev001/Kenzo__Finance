import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DocumentKind,
  EnquiryPriority,
  EnquiryStatus,
  FollowUpMethod,
  FollowUpOutcome,
} from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true ? true : value === 'false' || value === false ? false : value;

export const MAX_ITEMS = 100;

// ---------------------------------------------------------------------------
// Items (existing products / models only)
// ---------------------------------------------------------------------------

export class EnquiryItemInputDto {
  @ApiProperty({ description: 'Existing Product id (Module 2)' })
  @IsUUID('4', { message: 'Select a valid product' })
  productId!: string;

  @ApiPropertyOptional({ description: 'Existing ProductModel id of that product' })
  @IsOptional()
  @IsUUID('4', { message: 'Select a valid model' })
  @Transform(blank)
  productModelId?: string;

  @ApiProperty({ minimum: 1 })
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(10_000_000)
  quantity!: number;

  @ApiPropertyOptional({ default: 'Nos', example: 'Nos' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(blank)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(blank)
  technicalRequirements?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(blank)
  remarks?: string;
}

export class UpdateEnquiryItemDto extends PartialType(EnquiryItemInputDto) {}

// ---------------------------------------------------------------------------
// Enquiry
// ---------------------------------------------------------------------------

export class CreateEnquiryDto {
  @ApiProperty({ description: 'Existing Customer id (Module 3)' })
  @IsUUID('4', { message: 'Select a customer' })
  customerId!: string;

  @ApiPropertyOptional({ description: 'Contact person of that customer' })
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  customerContactId?: string;

  @ApiPropertyOptional({ description: 'Defaults to today (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Enquiry date must be a date' })
  enquiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'Select a valid source' })
  @Transform(blank)
  sourceId?: string;

  @ApiPropertyOptional({ enum: EnquiryPriority, default: EnquiryPriority.NORMAL })
  @IsOptional()
  @IsEnum(EnquiryPriority)
  priority?: EnquiryPriority;

  @ApiPropertyOptional({ description: 'User id of the assigned employee' })
  @IsOptional()
  @IsUUID('4', { message: 'Select a valid employee' })
  @Transform(blank)
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(blank)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  internalRemarks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'Expected decision date must be a date' })
  expectedDecisionDate?: string;

  @ApiPropertyOptional({ description: 'Preliminary only, never a price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Expected budget must be a number with up to 2 decimals' })
  @Min(0)
  @Max(999_999_999_999.99)
  expectedBudget?: number;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code, e.g. INR' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  currency?: string;

  @ApiPropertyOptional({ example: 'Within 3 weeks' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blank)
  expectedDeliveryTimeline?: string;

  @ApiPropertyOptional({ example: '50% advance' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(blank)
  paymentPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  commercialNotes?: string;

  @ApiPropertyOptional({ description: 'First planned follow-up date' })
  @IsOptional()
  @IsDateString()
  nextFollowUpDate?: string;

  @ApiProperty({ type: [EnquiryItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one product requirement' })
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => EnquiryItemInputDto)
  items!: EnquiryItemInputDto[];
}

/** Scalars only (send null to clear). Items, status and assignment have their own endpoints. */
export class UpdateEnquiryDto extends PartialType(OmitType(CreateEnquiryDto, ['items', 'assignedToId'] as const)) {}

export class AssignEnquiryDto {
  @ApiPropertyOptional({ nullable: true, description: 'User id; null unassigns' })
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string | null;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: EnquiryStatus })
  @IsEnum(EnquiryStatus)
  status!: EnquiryStatus;

  @ApiPropertyOptional({ description: 'Required for On Hold, Lost, Closed and reopening' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(blank)
  reason?: string;
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export class FollowUpInputDto {
  @ApiProperty({ description: 'When the interaction happened (ISO date-time)' })
  @IsDateString({}, { message: 'Follow-up date must be a date' })
  followUpDate!: string;

  @ApiPropertyOptional({ description: 'Customer contact person' })
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  contactId?: string;

  @ApiProperty({ enum: FollowUpMethod })
  @IsEnum(FollowUpMethod, { message: 'Select a communication method' })
  method!: FollowUpMethod;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Discussion summary is required' })
  @MaxLength(4000)
  @Transform(trim)
  discussionSummary!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  customerResponse?: string;

  @ApiProperty({ enum: FollowUpOutcome })
  @IsEnum(FollowUpOutcome, { message: 'Select an outcome' })
  outcome!: FollowUpOutcome;

  @ApiPropertyOptional({ description: 'Next planned follow-up (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  nextFollowUpDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  @Transform(blank)
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(blank)
  internalNotes?: string;
}

export class UpdateFollowUpDto extends PartialType(FollowUpInputDto) {}

export class FollowUpQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['today', 'upcoming', 'overdue', 'completed'] })
  @IsOptional()
  @IsIn(['today', 'upcoming', 'overdue', 'completed'])
  view?: 'today' | 'upcoming' | 'overdue' | 'completed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

// ---------------------------------------------------------------------------
// Sources, attachments, query
// ---------------------------------------------------------------------------

export class EnquirySourceDto {
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

export class UpdateEnquirySourceDto extends PartialType(EnquirySourceDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const ENQUIRY_DOCUMENT_KINDS = [
  DocumentKind.ENQUIRY_REQUIREMENT,
  DocumentKind.ENQUIRY_TECH_SPEC,
  DocumentKind.ENQUIRY_REFERENCE_IMAGE,
  DocumentKind.ENQUIRY_EXISTING_QUOTATION,
  DocumentKind.ENQUIRY_OTHER,
] as const;
export type EnquiryDocumentKind = (typeof ENQUIRY_DOCUMENT_KINDS)[number];

export class UploadEnquiryDocumentDto {
  @ApiPropertyOptional({ enum: ENQUIRY_DOCUMENT_KINDS })
  @IsOptional()
  @IsIn(ENQUIRY_DOCUMENT_KINDS, { message: 'Unknown attachment type' })
  kind?: EnquiryDocumentKind;
}

export const ENQUIRY_SORT_FIELDS = ['enquiryNumber', 'enquiryDate', 'priority', 'status', 'nextFollowUpDate', 'createdAt'] as const;

export class QueryEnquiriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Enquiry number, customer name/code, contact, phone, product or model' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ enum: EnquiryStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(EnquiryStatus, { each: true })
  status?: EnquiryStatus[];

  @ApiPropertyOptional({ enum: EnquiryPriority })
  @IsOptional()
  @IsEnum(EnquiryPriority)
  priority?: EnquiryPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  sourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ description: 'Enquiry date from' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Enquiry date to (inclusive)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Only enquiries whose next follow-up is before today' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overdueOnly?: boolean;

  @ApiPropertyOptional({ enum: ENQUIRY_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(ENQUIRY_SORT_FIELDS)
  sortBy: (typeof ENQUIRY_SORT_FIELDS)[number] = 'createdAt';
}
