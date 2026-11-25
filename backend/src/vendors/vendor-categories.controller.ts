import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeName } from '../common/utils/normalize';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateVendorCategoryDto {
  @ApiProperty({ example: 'Distributor' })
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateVendorCategoryDto {
  @ApiPropertyOptional()
  // Validated whenever present: IsOptional would let `null` through (500 in
  // normalizeName) and a blank name would save an empty category.
  @ValidateIf((o: UpdateVendorCategoryDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

@Injectable()
export class VendorCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(includeInactive: boolean) {
    return this.prisma.vendorCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { vendors: true } } },
    });
  }

  async create(dto: CreateVendorCategoryDto, actor: AuthenticatedUser) {
    const category = await this.prisma.vendorCategory.create({
      data: {
        name: dto.name,
        normalizedName: normalizeName(dto.name),
        description: dto.description ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor_category.create',
      entityType: 'VendorCategory',
      entityId: category.id,
      summary: `Created vendor category ${category.name}`,
      after: { name: category.name },
    });

    return category;
  }

  async update(id: string, dto: UpdateVendorCategoryDto, actor: AuthenticatedUser) {
    const updated = await this.prisma.vendorCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name: dto.name, normalizedName: normalizeName(dto.name) }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor_category.update',
      entityType: 'VendorCategory',
      entityId: id,
      summary: `Updated vendor category ${updated.name}`,
      after: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }
}

@ApiTags('Vendor categories')
@ApiBearerAuth()
@Controller('vendor-categories')
export class VendorCategoriesController {
  constructor(private readonly service: VendorCategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'List vendor categories' })
  async list() {
    return this.service.list(false);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create a vendor category' })
  async create(
    @Body() dto: CreateVendorCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update a vendor category' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateVendorCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }
}
