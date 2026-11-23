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
import {
  ArchiveVendorDto,
  UpdateVendorDto,
  UpdateVendorStatusDto,
} from './dto/update-vendor.dto';
import { QueryVendorsDto } from './dto/query-vendors.dto';
import {
  MapVendorCompanyDto,
  MapVendorProductDto,
  UpdateVendorCompanyDto,
  UpdateVendorProductDto,
} from './dto/mapping.dto';
import { VendorLookupQueryDto } from './dto/vendor-children.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';
import { buildXlsx } from '../common/export/xlsx';
import { recordsToSheet, requestedFormat, XLSX_CONTENT_TYPE } from '../common/export/records-sheet';
import { contextOf } from './vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  // --- Collection-level routes (declared before :id) ------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Search, filter, sort and paginate vendors',
    description:
      'All filtering runs in PostgreSQL. `search` also matches contact ' +
      'persons, mapped brand names and mapped product names / model numbers.',
  })
  async findAll(@Query() query: QueryVendorsDto) {
    return this.vendorsService.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Dashboard figures counted from live records' })
  async summary() {
    return this.vendorsService.summary();
  }

  @Get('lookup')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Active-vendor selector for other modules',
    description:
      'Returns only active, non-archived vendors - the ones selectable for a ' +
      'new business document. Filter by productId to get its suppliers.',
  })
  async lookup(@Query() query: VendorLookupQueryDto) {
    return this.vendorsService.lookup(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.VENDOR_EXPORT)
  @ApiOperation({ summary: 'Export the filtered vendor list as CSV or Excel (format=xlsx)' })
  async export(
    @Query() query: QueryVendorsDto,
    @Query('format') format: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const rows = await this.vendorsService.findAllForExport(query);

    const records = rows.map((row) => {
        const primary = row.contacts[0];
        return {
          'Vendor Code': row.vendorCode,
          'Vendor Name': row.businessName,
          'Legal Name': row.legalName ?? '',
          'Vendor Type': row.category?.name ?? '',
          'Registration No.': row.registrationNumber ?? '',
          'Primary Contact': primary?.name ?? row.contactPerson ?? '',
          'Contact Phone': primary?.phone ?? '',
          'Contact Email': primary?.email ?? '',
          'Company Phone': row.phone ?? '',
          'Company Email': row.email ?? '',
          Website: row.website ?? '',
          Address: [row.addressLine1, row.addressLine2].filter(Boolean).join(', '),
          City: row.city ?? '',
          State: row.state ?? '',
          'PIN Code': row.postalCode ?? '',
          Country: row.country,
          GSTIN: row.gstin ?? '',
          PAN: row.pan ?? '',
          Brands: row.companies.map((c) => c.company.name).join('; '),
          'Mapped Products': row._count.products,
          Status: row.archivedAt ? 'ARCHIVED' : row.status,
          'Created At': row.createdAt.toISOString().slice(0, 10),
        };
    });

    const today = new Date().toISOString().slice(0, 10);
    if (requestedFormat(format) === 'xlsx') {
      response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      response.setHeader('Content-Disposition', `attachment; filename="Vendors_${today}.xlsx"`);
      response.send(buildXlsx([recordsToSheet('Vendors', records)]));
      return;
    }
    const filename = `vendors-${today}.csv`;
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM so Excel opens UTF-8 names correctly.
    response.send('﻿' + toCsv(records));
  }

  @Get('check-duplicates')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Check for possible duplicate vendors before saving',
    description:
      'Used by the create and OCR review forms to warn early. The same check ' +
      'runs again server-side on create - this endpoint is a convenience, ' +
      'not the enforcement point.',
  })
  @ApiQuery({ name: 'businessName', required: false })
  @ApiQuery({ name: 'gstin', required: false })
  @ApiQuery({ name: 'email', required: false, description: 'Comma-separated list allowed' })
  @ApiQuery({ name: 'phone', required: false, description: 'Comma-separated list allowed' })
  @ApiQuery({ name: 'excludeVendorId', required: false })
  async checkDuplicates(
    @Query('businessName') businessName?: string,
    @Query('gstin') gstin?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('excludeVendorId') excludeVendorId?: string,
  ) {
    const split = (value?: string) =>
      (value ?? '').split(',').map((part) => part.trim()).filter(Boolean).slice(0, 20);

    const matches = await this.vendorsService.findDuplicates(
      {
        businessName: businessName?.slice(0, 200),
        gstin: gstin?.slice(0, 20),
        emails: split(email),
        phones: split(phone),
      },
      excludeVendorId && /^[0-9a-f-]{36}$/i.test(excludeVendorId) ? excludeVendorId : undefined,
    );
    return { matches, hasBlocking: matches.some((m) => m.severity === 'blocking') };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_CREATE)
  @ApiOperation({
    summary: 'Create a vendor (manual entry or confirmed OCR draft)',
    description:
      'Contacts, addresses, brand ids and product ids are created in the same ' +
      'transaction. Pass ocrJobId to confirm a reviewed OCR draft: its source ' +
      'document is attached to the new vendor and the draft is consumed.',
  })
  async create(
    @Body() dto: CreateVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.create(dto, user, contextOf(request));
  }

  // --- Single vendor ---------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Vendor profile with contacts, addresses, brands, products and documents' })
  async findOne(@Param('id', uuid()) id: string) {
    return this.vendorsService.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({
    summary: 'Activity history',
    description: 'Audit events for the vendor and all of its contacts, addresses, mappings and documents.',
  })
  async activity(
    @Param('id', uuid()) id: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.vendorsService.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VENDOR_UPDATE)
  @ApiOperation({ summary: 'Update vendor details (send null to clear a field)' })
  async update(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.update(id, dto, user, contextOf(request));
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.VENDOR_DEACTIVATE)
  @ApiOperation({
    summary: 'Activate or deactivate a vendor',
    description: 'Inactive vendors keep all history and relationships but are not offered for new business.',
  })
  async updateStatus(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateVendorStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.updateStatus(id, dto, user, contextOf(request));
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.VENDOR_ARCHIVE)
  @ApiOperation({
    summary: 'Archive a vendor (soft delete)',
    description: 'Hides the vendor from lists; history and relationships are preserved.',
  })
  async archive(
    @Param('id', uuid()) id: string,
    @Body() dto: ArchiveVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.archive(id, user, contextOf(request), dto.reason);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.VENDOR_ARCHIVE)
  @ApiOperation({ summary: 'Restore an archived vendor' })
  async restore(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.restore(id, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.VENDOR_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete an unreferenced vendor',
    description:
      'Refused with 409 when the vendor has product mappings, documents, an ' +
      'OCR source or (in later modules) business transactions. Use status ' +
      'or archive for anything with history.',
  })
  async remove(
    @Param('id', uuid()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.vendorsService.remove(id, user, contextOf(request));
  }

  // --- Brand mappings ---------------------------------------------------------

  @Get(':id/companies')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Brands supplied by the vendor' })
  async listCompanies(@Param('id', uuid()) id: string) {
    return this.vendorsService.listCompanies(id);
  }

  @Post(':id/companies')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_BRANDS)
  @ApiOperation({ summary: 'Map a shared brand to the vendor' })
  async mapCompany(
    @Param('id', uuid()) id: string,
    @Body() dto: MapVendorCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.mapCompany(id, dto, user, contextOf(request));
  }

  @Patch(':id/companies/:companyId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_BRANDS)
  @ApiOperation({ summary: 'Update the authorised-partner flag or remarks of a brand mapping' })
  async updateCompanyMapping(
    @Param('id', uuid()) id: string,
    @Param('companyId', uuid()) companyId: string,
    @Body() dto: UpdateVendorCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.updateCompanyMapping(id, companyId, dto, user, contextOf(request));
  }

  @Delete(':id/companies/:companyId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_BRANDS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a brand mapping',
    description: 'Refused with 409 while products of that brand are still mapped to the vendor.',
  })
  async unmapCompany(
    @Param('id', uuid()) id: string,
    @Param('companyId', uuid()) companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.vendorsService.unmapCompany(id, companyId, user, contextOf(request));
  }

  // --- Product mappings ------------------------------------------------------

  @Get(':id/products')
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Products and models supplied by the vendor' })
  async listProducts(@Param('id', uuid()) id: string) {
    return this.vendorsService.listProducts(id);
  }

  @Post(':id/products')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_PRODUCTS)
  @ApiOperation({
    summary: 'Map a shared catalogue product to the vendor',
    description: "The product's brand is mapped to the vendor automatically.",
  })
  async mapProduct(
    @Param('id', uuid()) id: string,
    @Body() dto: MapVendorProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.mapProduct(id, dto, user, contextOf(request));
  }

  @Patch(':id/products/:productId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Update vendor SKU, lead time, preferred flag or remarks' })
  async updateProductMapping(
    @Param('id', uuid()) id: string,
    @Param('productId', uuid()) productId: string,
    @Body() dto: UpdateVendorProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.vendorsService.updateProductMapping(id, productId, dto, user, contextOf(request));
  }

  @Delete(':id/products/:productId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_PRODUCTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product mapping' })
  async unmapProduct(
    @Param('id', uuid()) id: string,
    @Param('productId', uuid()) productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.vendorsService.unmapProduct(id, productId, user, contextOf(request));
  }
}
