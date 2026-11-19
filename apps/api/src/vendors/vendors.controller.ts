import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { QueryVendorsDto } from './dto/query-vendors.dto';
import {
  MapVendorCompanyDto,
  MapVendorProductDto,
  UpdateVendorProductDto,
} from './dto/mapping.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Search vendors by name, brand, product or model',
    description:
      'Server-side search, filtering, sorting and pagination. Brand and ' +
      'product filters match both direct brand mappings and brands reached ' +
      'through the vendor’s mapped products.',
  })
  async findAll(@Query() query: QueryVendorsDto) {
    return this.vendorsService.findAll(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.VENDOR_EXPORT)
  @ApiOperation({ summary: 'Export the filtered vendor list as CSV' })
  async export(
    @Query() query: QueryVendorsDto,
    @Res() response: Response,
  ): Promise<void> {
    const rows = await this.vendorsService.findAllForExport(query);

    const csv = toCsv(
      rows.map((row) => ({
        'Vendor Code': row.vendorCode,
        'Business Name': row.businessName,
        'Legal Name': row.legalName ?? '',
        Category: row.category?.name ?? '',
        'Contact Person': row.contactPerson ?? '',
        Email: row.email ?? '',
        Phone: row.phone ?? '',
        'Alternate Phone': row.alternatePhone ?? '',
        Address: [row.addressLine1, row.addressLine2].filter(Boolean).join(', '),
        City: row.city ?? '',
        State: row.state ?? '',
        'Postal Code': row.postalCode ?? '',
        Country: row.country,
        GSTIN: row.gstin ?? '',
        PAN: row.pan ?? '',
        Brands: row.companies.map((c) => c.company.name).join('; '),
        'Mapped Products': row._count.products,
        Status: row.status,
        'Created At': row.createdAt.toISOString(),
      })),
    );

    const filename = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM so Excel opens UTF-8 names correctly.
    response.send('﻿' + csv);
  }

  @Get('check-duplicates')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Check for possible duplicate vendors before saving',
    description:
      'Used by the create form to warn the user early. The same check runs ' +
      'again server-side on create - this endpoint is a convenience, not the ' +
      'enforcement point.',
  })
  @ApiQuery({ name: 'businessName', required: false })
  @ApiQuery({ name: 'gstin', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'phone', required: false })
  @ApiQuery({ name: 'excludeVendorId', required: false })
  async checkDuplicates(
    @Query('businessName') businessName?: string,
    @Query('gstin') gstin?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('excludeVendorId') excludeVendorId?: string,
  ) {
    const matches = await this.vendorsService.findDuplicates(
      { businessName, gstin, email, phone },
      excludeVendorId,
    );
    return { matches, hasBlocking: matches.some((m) => m.severity === 'blocking') };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_CREATE)
  @ApiOperation({ summary: 'Create a vendor (manual entry or confirmed OCR draft)' })
  async create(
    @Body() dto: CreateVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.create(dto, user, contextOf(request));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Vendor detail with contacts, brands, products and documents' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VENDOR_UPDATE)
  @ApiOperation({ summary: 'Update vendor details' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.update(id, dto, user, contextOf(request));
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.VENDOR_ARCHIVE)
  @ApiOperation({
    summary: 'Archive a vendor (soft delete)',
    description: 'Vendors are never hard-deleted; history must be preserved.',
  })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.archive(id, user, contextOf(request), body?.reason);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.VENDOR_ARCHIVE)
  @ApiOperation({ summary: 'Restore an archived vendor' })
  async restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.restore(id, user, contextOf(request));
  }

  // --- Brand mappings -------------------------------------------------------

  @Post(':id/companies')
  @RequirePermissions(PERMISSIONS.VENDOR_MAP_PRODUCTS)
  @ApiOperation({ summary: 'Map a brand/company to the vendor' })
  async mapCompany(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MapVendorCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.mapCompany(id, dto, user, contextOf(request));
  }

  @Delete(':id/companies/:companyId')
  @RequirePermissions(PERMISSIONS.VENDOR_MAP_PRODUCTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a brand mapping' })
  async unmapCompany(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('companyId', new ParseUUIDPipe({ version: '4' })) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.vendorsService.unmapCompany(id, companyId, user, contextOf(request));
  }

  // --- Product mappings -----------------------------------------------------

  @Post(':id/products')
  @RequirePermissions(PERMISSIONS.VENDOR_MAP_PRODUCTS)
  @ApiOperation({
    summary: 'Map a product to the vendor',
    description: "The product's brand is mapped to the vendor automatically.",
  })
  async mapProduct(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MapVendorProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.mapProduct(id, dto, user, contextOf(request));
  }

  @Patch(':id/products/:productId')
  @RequirePermissions(PERMISSIONS.VENDOR_MAP_PRODUCTS)
  @ApiOperation({ summary: 'Update vendor SKU, lead time or preferred flag' })
  async updateProductMapping(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: UpdateVendorProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.updateProductMapping(
      id,
      productId,
      dto,
      user,
      contextOf(request),
    );
  }

  @Delete(':id/products/:productId')
  @RequirePermissions(PERMISSIONS.VENDOR_MAP_PRODUCTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product mapping' })
  async unmapProduct(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.vendorsService.unmapProduct(id, productId, user, contextOf(request));
  }
}

function contextOf(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}
