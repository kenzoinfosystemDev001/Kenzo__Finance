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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CustomersService } from './customers.service';
import { CustomerRankingsService } from './customer-rankings.service';
import { CustomerRankingsQueryDto, SetFavouriteDto } from './dto/customer-rankings.dto';
import { CustomerChildrenService } from './customer-children.service';
import {
  AddProductInterestDto,
  CreateCustomerDto,
  CUSTOMER_DOCUMENT_KINDS,
  CustomerAddressInputDto,
  CustomerCategoryDto,
  CustomerContactInputDto,
  CustomerLookupQueryDto,
  CustomerStatusDto,
  QueryCustomersDto,
  UpdateCustomerAddressDto,
  UpdateCustomerCategoryDto,
  UpdateCustomerContactDto,
  UpdateCustomerDto,
  UpdateProductInterestDto,
  UploadCustomerDocumentDto,
} from './dto/customer.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';
import { buildXlsx } from '../common/export/xlsx';
import { recordsToSheet, requestedFormat, XLSX_CONTENT_TYPE } from '../common/export/records-sheet';
import { sendStoredFile } from '../documents/send-stored-file';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const fileBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...CUSTOMER_DOCUMENT_KINDS] } },
  },
};

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly children: CustomerChildrenService,
    private readonly rankings: CustomerRankingsService,
  ) {}

  // --- Collection routes (before :id) ---------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Search, filter, sort and paginate customers (server-side)' })
  findAll(@Query() query: QueryCustomersDto) {
    return this.customersService.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Dashboard figures counted from live records' })
  summary() {
    return this.customersService.summary();
  }

  @Get('lookup')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Customer selector for enquiries/quotations (active only by default)' })
  lookup(@Query() query: CustomerLookupQueryDto) {
    return this.customersService.lookup(query);
  }

  @Get('check-duplicates')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Possible duplicates by name, GSTIN, PAN, email or phone (advisory)' })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'gstin', required: false })
  @ApiQuery({ name: 'pan', required: false })
  @ApiQuery({ name: 'email', required: false, description: 'Comma-separated' })
  @ApiQuery({ name: 'phone', required: false, description: 'Comma-separated' })
  @ApiQuery({ name: 'excludeId', required: false })
  async checkDuplicates(
    @Query('name') name?: string,
    @Query('gstin') gstin?: string,
    @Query('pan') pan?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('excludeId') excludeId?: string,
  ) {
    const split = (v?: string) => (v ?? '').split(',').map((p) => p.trim()).filter(Boolean).slice(0, 20);
    const matches = await this.customersService.findDuplicates(
      { name: name?.slice(0, 200), gstin: gstin?.slice(0, 20), pan: pan?.slice(0, 15), emails: split(email), phones: split(phone) },
      excludeId && /^[0-9a-f-]{36}$/i.test(excludeId) ? excludeId : undefined,
    );
    return { matches, hasBlocking: matches.some((m) => m.severity === 'blocking') };
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.CUSTOMER_EXPORT)
  @ApiOperation({ summary: 'Export the filtered customer list as CSV or Excel (format=xlsx)' })
  async export(@Query() query: QueryCustomersDto, @Query('format') format: string | undefined, @Res() response: Response): Promise<void> {
    const rows = await this.customersService.findAllForExport(query);
    const records = rows.map((c) => ({
        'Customer ID': c.customerCode,
        'Customer Name': c.name,
        Type: c.customerType === 'BUSINESS' ? 'Business' : 'Individual',
        Category: c.category?.name ?? '',
        Industry: c.industry ?? '',
        'Primary Contact': c.contacts[0]?.name ?? '',
        Phone: c.contacts[0]?.phone ?? '',
        Email: c.contacts[0]?.email ?? '',
        City: c.addresses[0]?.city ?? '',
        State: c.addresses[0]?.state ?? '',
        Country: c.addresses[0]?.country ?? '',
        'Tax Country': c.taxCountry,
        GSTIN: c.gstin ?? '',
        PAN: c.pan ?? '',
        CIN: c.cin ?? '',
        'Tax Registration No.': c.taxRegistrationNumber ?? '',
        Website: c.website ?? '',
        Status: c.status,
        'Created At': c.createdAt.toISOString(),
    }));
    const today = new Date().toISOString().slice(0, 10);
    if (requestedFormat(format) === 'xlsx') {
      response.setHeader('Content-Type', XLSX_CONTENT_TYPE);
      response.setHeader('Content-Disposition', `attachment; filename="customers-${today}.xlsx"`);
      response.send(buildXlsx([recordsToSheet('Customers', records)]));
      return;
    }
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="customers-${today}.csv"`);
    response.send('﻿' + toCsv(records));
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Customer categories (configurable)' })
  listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.customersService.listCategories(includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create a customer category' })
  createCategory(@Body() dto: CustomerCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.createCategory(dto, user);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Rename, describe or (de)activate a customer category' })
  updateCategory(@Param('id', uuid()) id: string, @Body() dto: UpdateCustomerCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.updateCategory(id, dto, user);
  }

  @Delete('categories/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Permanently delete a customer category that no customer uses' })
  deleteCategory(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.customersService.deleteCategory(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_CREATE)
  @ApiOperation({
    summary: 'Create a customer with contacts and addresses',
    description:
      'Needs at least one contact with a phone or email. GSTIN/PAN/CIN only for tax country India. ' +
      'A matching GSTIN is refused; similar name/PAN/email/phone needs confirmPossibleDuplicate.',
  })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customersService.create(dto, user, contextOf(request));
  }

  // --- Single customer ----------------------------------------------------------

  /** Top Customers: ranked by issued final invoices. view = all | top | favourite. */
  @Get('rankings')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Customer rankings by purchase history (issued and sent final invoices only)' })
  customerRankings(@Query() query: CustomerRankingsQueryDto) {
    return this.rankings.list(query);
  }

  /** Admin-only: marks or unmarks a favourite customer. */
  @Patch(':id/favourite')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Mark or unmark a customer as a favourite (administrators only)' })
  setFavourite(@Param('id', uuid()) id: string, @Body() dto: SetFavouriteDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.rankings.setFavourite(id, dto.isFavourite, user, contextOf(request));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Customer profile with contacts, addresses, products of interest and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.customersService.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Activity history from the audit log' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.customersService.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'Update customer details (send null to clear a field)' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customersService.update(id, dto, user, contextOf(request));
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPDATE)
  @ApiOperation({ summary: 'Activate or deactivate a customer' })
  setStatus(@Param('id', uuid()) id: string, @Body() dto: CustomerStatusDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.customersService.setStatus(id, dto, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete an unreferenced customer (409 when referenced)' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.customersService.remove(id, user, contextOf(request));
  }

  // --- Contacts -------------------------------------------------------------------

  @Get(':id/contacts')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Contact persons' })
  listContacts(@Param('id', uuid()) id: string) {
    return this.children.listContacts(id);
  }

  @Post(':id/contacts')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_CONTACTS)
  @ApiOperation({ summary: 'Add a contact person (first contact becomes primary)' })
  createContact(@Param('id', uuid()) id: string, @Body() dto: CustomerContactInputDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.createContact(id, dto, user, contextOf(request));
  }

  // --- Addresses ------------------------------------------------------------------

  @Get(':id/addresses')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Addresses' })
  listAddresses(@Param('id', uuid()) id: string) {
    return this.children.listAddresses(id);
  }

  @Post(':id/addresses')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES)
  @ApiOperation({ summary: 'Add an address (first of its type becomes default)' })
  createAddress(@Param('id', uuid()) id: string, @Body() dto: CustomerAddressInputDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.createAddress(id, dto, user, contextOf(request));
  }

  // --- Products of interest ---------------------------------------------------------

  @Get(':id/products')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  @ApiOperation({ summary: 'Products and models of interest (from Product Management)' })
  listInterests(@Param('id', uuid()) id: string) {
    return this.children.listInterests(id);
  }

  @Post(':id/products')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Add a product (and optionally models) of interest. Not an enquiry or order.' })
  addInterest(@Param('id', uuid()) id: string, @Body() dto: AddProductInterestDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.addInterest(id, dto, user, contextOf(request));
  }

  @Patch(':id/products/:mappingId')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS)
  @ApiOperation({ summary: 'Update notes on a product of interest' })
  updateInterest(
    @Param('id', uuid()) id: string,
    @Param('mappingId', uuid()) mappingId: string,
    @Body() dto: UpdateProductInterestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.children.updateInterest(id, mappingId, dto, user, contextOf(request));
  }

  @Delete(':id/products/:mappingId')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_PRODUCTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product of interest (the product itself is not changed)' })
  async removeInterest(@Param('id', uuid()) id: string, @Param('mappingId', uuid()) mappingId: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.children.removeInterest(id, mappingId, user, contextOf(request));
  }

  // --- Documents ------------------------------------------------------------------

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ, PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'Current customer documents' })
  listDocuments(@Param('id', uuid()) id: string) {
    return this.children.listDocuments(id);
  }

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Upload a customer document (type verified from file bytes, stored privately)' })
  uploadDocument(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadCustomerDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.children.uploadDocument(id, file, dto.kind, user);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions(PERMISSIONS.CUSTOMER_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace a document (old version archived and linked)' })
  replaceDocument(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadCustomerDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.children.replaceDocument(id, documentId, file, dto.kind, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.CUSTOMER_DELETE_DOCUMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a document (soft; kept for audit)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.children.removeDocument(id, documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a customer document' })
  async documentContent(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    sendStoredFile(response, await this.children.openDocument(id, documentId, user, preview === 'true'));
  }
}

/** Contact and address rows addressed by their own id, as in the module spec. */
@ApiTags('Customers')
@ApiBearerAuth()
@Controller()
export class CustomerRowsController {
  constructor(private readonly children: CustomerChildrenService) {}

  @Patch('customer-contacts/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_CONTACTS)
  @ApiOperation({ summary: 'Update a contact (isPrimary=true makes it the primary contact)' })
  updateContact(@Param('id', uuid()) id: string, @Body() dto: UpdateCustomerContactDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.updateContact(id, dto, user, contextOf(request));
  }

  @Delete('customer-contacts/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_CONTACTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a contact (refused if it is the last reachable one)' })
  async removeContact(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.children.removeContact(id, user, contextOf(request));
  }

  @Patch('customer-addresses/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES)
  @ApiOperation({ summary: 'Update an address (isDefault=true makes it the default of its type)' })
  updateAddress(@Param('id', uuid()) id: string, @Body() dto: UpdateCustomerAddressDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.updateAddress(id, dto, user, contextOf(request));
  }

  @Delete('customer-addresses/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_MANAGE_ADDRESSES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an address' })
  async removeAddress(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.children.removeAddress(id, user, contextOf(request));
  }
}
