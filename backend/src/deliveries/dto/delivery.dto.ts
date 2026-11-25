import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DeliveryStatus, DocumentKind, TransportMode } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** '' → null so optional fields can be cleared. */
const nullable = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
const blank = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? undefined : value.trim()) : value);

export class DeliveryItemDto {
  @ApiProperty({ description: 'Final invoice item being delivered' }) @IsUUID('4') invoiceItemId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(10_000_000) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100_000) packageCount?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) remarks?: string | null;
}

class DeliveryHeaderDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() deliveryDate?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsDateString() expectedDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) contactPerson?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) contactNumber?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) internalRemarks?: string | null;
}

export class CreateDeliveryDto extends DeliveryHeaderDto {
  @ApiProperty() @IsUUID('4') customerId!: string;
  @ApiProperty() @IsUUID('4') finalInvoiceId!: string;
  @ApiProperty({ description: "Delivery address (the form offers the customer's addresses)" })
  @IsString() @IsNotEmpty({ message: 'Delivery address is required' }) @MaxLength(2000) @Transform(trim) deliveryAddress!: string;
  @ApiPropertyOptional({ description: 'RETURNED or DELIVERY_FAILED delivery of the same invoice this one redelivers' }) @IsOptional() @IsUUID('4') redeliveryOfId?: string;
  @ApiProperty({ type: [DeliveryItemDto] })
  @IsArray() @ArrayMinSize(1, { message: 'Select at least one item' }) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items!: DeliveryItemDto[];
}

export class UpdateDeliveryDto extends DeliveryHeaderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty({ message: 'Delivery address is required' }) @MaxLength(2000) @Transform(trim) deliveryAddress?: string;
  @ApiPropertyOptional({ type: [DeliveryItemDto] })
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items?: DeliveryItemDto[];
}

export class ScheduleDeliveryDto {
  @ApiProperty() @IsDateString() expectedDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) remarks?: string;
}

export const SIMPLE_TARGETS = [DeliveryStatus.READY_FOR_DISPATCH, DeliveryStatus.IN_TRANSIT, DeliveryStatus.RETURNED] as const;
export class DeliveryStatusDto {
  @ApiProperty({ enum: SIMPLE_TARGETS }) @IsIn(SIMPLE_TARGETS) status!: (typeof SIMPLE_TARGETS)[number];
  @ApiPropertyOptional({ description: 'Required when marking returned' }) @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) remarks?: string;
}

export class DispatchDeliveryDto {
  @ApiProperty() @IsDateString() dispatchDate!: string;
  @ApiPropertyOptional({ example: '14:30' }) @IsOptional() @Transform(nullable) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Dispatch time must be HH:MM' }) dispatchTime?: string | null;
  @ApiProperty({ enum: TransportMode }) @IsEnum(TransportMode) transportMode!: TransportMode;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) transporterName?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) vehicleNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) driverName?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) driverContact?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) courierCompany?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) trackingNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) lrGrNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) dispatchRemarks?: string | null;
}

export class TrackingDto {
  @ApiProperty({ example: 'Reached Pune hub' }) @IsString() @IsNotEmpty() @MaxLength(100) @Transform(trim) status!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) remarks?: string | null;
  @ApiPropertyOptional({ description: 'When it happened (defaults to now)' }) @IsOptional() @IsDateString() eventAt?: string;
  @ApiPropertyOptional({ default: false, description: 'Also move a DISPATCHED delivery to IN_TRANSIT' }) @IsOptional() @IsBoolean() markInTransit?: boolean;
}

export class FailureDto {
  @ApiProperty() @IsDateString() failureDate!: string;
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Failure reason is required' }) @MaxLength(2000) @Transform(trim) failureReason!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsDateString() nextAttemptDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) remarks?: string | null;
}

export class ReceivedItemDto {
  @ApiProperty() @IsUUID('4') deliveryItemId!: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) deliveredQuantity!: number;
}

export class ConfirmDeliveryDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Receiver name is required' }) @MaxLength(200) @Transform(trim) receiverName!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) receiverContact?: string | null;
  @ApiProperty() @IsDateString() actualDeliveryDate!: string;
  @ApiProperty({ description: 'Explicit acknowledgment that the customer received the goods' }) @IsBoolean() deliveryConfirmation!: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) remarks?: string | null;
  @ApiPropertyOptional({ type: [ReceivedItemDto], description: 'Quantities actually received; omit when everything dispatched was received' })
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ReceivedItemDto) items?: ReceivedItemDto[];
}

export class AmendPodDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) @Transform(trim) receiverName!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) receiverContact?: string | null;
  @ApiProperty() @IsDateString() actualDeliveryDate!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) remarks?: string | null;
  @ApiProperty({ description: 'Why the recorded proof is being corrected' }) @IsString() @IsNotEmpty({ message: 'Amendment reason is required' }) @MaxLength(2000) @Transform(trim) amendmentReason!: string;
}

export class CancelDeliveryDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Cancellation reason is required' }) @MaxLength(2000) @Transform(trim) reason!: string;
}

export class PackageItemDto {
  @ApiProperty() @IsUUID('4') deliveryItemId!: string;
  @ApiProperty() @IsInt() @Min(1) quantity!: number;
}
export class PackageDto {
  @ApiProperty() @IsInt() @Min(1) @Max(10_000) packageNumber!: number;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional({ description: 'As entered, e.g. "12.5 kg" (never assumed)' }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) weight?: string | null;
  @ApiPropertyOptional({ description: 'As entered, e.g. "60x40x40 cm"' }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) dimensions?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(nullable) @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiProperty({ type: [PackageItemDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PackageItemDto) items!: PackageItemDto[];
}
export class PackagesDto {
  @ApiProperty({ type: [PackageDto] }) @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => PackageDto) packages!: PackageDto[];
}

export const DELIVERY_UPLOAD_KINDS = [DocumentKind.DELIVERY_POD, DocumentKind.DELIVERY_SIGNATURE, DocumentKind.DELIVERY_PHOTO, DocumentKind.DELIVERY_ATTACHMENT] as const;
export class UploadDeliveryDocumentDto {
  @ApiPropertyOptional({ enum: DELIVERY_UPLOAD_KINDS }) @IsOptional() @IsIn(DELIVERY_UPLOAD_KINDS) kind?: (typeof DELIVERY_UPLOAD_KINDS)[number];
}

export const DELIVERY_SORT_FIELDS = ['deliveryNumber', 'deliveryDate', 'expectedDate', 'actualDeliveryDate', 'dispatchDate', 'status', 'createdAt'] as const;
export class QueryDeliveriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Delivery no., invoice no., customer, tracking / LR number, transporter, courier, location' }) @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') finalInvoiceId?: string;
  @ApiPropertyOptional({ enum: DeliveryStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value)) @IsArray() @IsEnum(DeliveryStatus, { each: true }) status?: DeliveryStatus[];
  @ApiPropertyOptional({ description: 'Delivery date from' }) @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dispatchFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dispatchTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deliveredFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() deliveredTo?: string;
  @ApiPropertyOptional({ description: 'Transporter or courier name' }) @IsOptional() @IsString() @MaxLength(200) @Transform(trim) transporter?: string;
  @ApiPropertyOptional({ description: 'Part of the delivery address' }) @IsOptional() @IsString() @MaxLength(200) @Transform(trim) location?: string;
  @ApiPropertyOptional({ description: 'Expected date passed and not delivered' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() delayedOnly?: boolean;
  @ApiPropertyOptional({ enum: DELIVERY_SORT_FIELDS, default: 'createdAt' }) @IsOptional() @IsIn(DELIVERY_SORT_FIELDS) sortBy: (typeof DELIVERY_SORT_FIELDS)[number] = 'createdAt';
}

export class DeliveryReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) transporter?: string;
}

export class EligibleInvoicesQueryDto {
  @ApiProperty() @IsUUID('4') customerId!: string;
}
