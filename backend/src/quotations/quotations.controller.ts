import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentKind } from '@prisma/client';
import type { Request, Response } from 'express';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { QuotationEmailService } from './quotation-email.service';
import { RecipientSearchQueryDto, SendQuotationEmailDto } from './dto/quotation-email.dto';
import {
  CommunicationDto,
  CompanyProfileDto,
  CompareQueryDto,
  CreateQuotationDto,
  CreateRevisionDto,
  QUOTATION_UPLOAD_KINDS,
  QueryQuotationsDto,
  QuotationSettingsDto,
  ReportQueryDto,
  StatusActionDto,
  UpdateDraftDto,
  UploadQuotationDocumentDto,
} from './dto/quotation.dto';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { DocumentsService } from '../documents/documents.service';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { toCsv } from '../common/utils/csv';
import { sendStoredFile } from '../documents/send-stored-file';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });
const fileBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...QUOTATION_UPLOAD_KINDS] } },
  },
};
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotations: QuotationsService,
    private readonly pdf: QuotationPdfService,
    private readonly enquiries: EnquiriesService,
    private readonly documents: DocumentsService,
    private readonly quotationEmails: QuotationEmailService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Search, filter, sort and paginate quotations' })
  findAll(@Query() query: QueryQuotationsDto) {
    return this.quotations.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Dashboard counts by status, from live records' })
  summary() {
    return this.quotations.summary();
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Active users a quotation can be assigned to' })
  assignees() {
    return this.enquiries.assignableUsers();
  }

  @Get('reports')
  @RequirePermissions(PERMISSIONS.QUOTATION_REPORTS)
  @ApiOperation({ summary: 'Status, customer, employee, acceptance, conversion and revision reports' })
  reports(@Query() query: ReportQueryDto) {
    return this.quotations.reports(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.QUOTATION_EXPORT)
  @ApiOperation({ summary: 'Export the filtered quotation list as CSV' })
  async export(@Query() query: QueryQuotationsDto, @Res() response: Response): Promise<void> {
    const rows = await this.quotations.findAllForExport(query);
    const csv = toCsv(
      rows.map((q) => ({
        'Quotation No.': q.quotationNumber,
        Revision: q.currentRevisionNumber,
        'Quotation Date': day(q.revisions[0]?.quotationDate),
        'Valid Until': day(q.revisions[0]?.validUntil),
        Customer: q.customer.name,
        'Customer Code': q.customer.customerCode,
        Enquiry: q.enquiry?.enquiryNumber ?? '',
        'Assigned To': q.assignedTo?.fullName ?? '',
        Status: q.status,
        Currency: q.currency,
        'Grand Total': q.currentTotal.toFixed(2),
        Created: day(q.createdAt),
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="quotations-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('settings')
  @RequirePermissions() // quotation.read or settings.manage, checked in the service
  @ApiOperation({ summary: 'Default terms, company profile printed on PDFs and the approval switch' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.quotations.getSettingsFor(user);
  }

  @Patch('settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update the default terms copied into new quotations' })
  updateSettings(@Body() dto: QuotationSettingsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quotations.updateSettings({ defaultTerms: dto.defaultTerms }, user);
  }

  @Put('settings/company-profile')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Replace the company details printed on quotation PDFs' })
  updateCompanyProfile(@Body() dto: CompanyProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.quotations.updateSettings({ companyProfile: dto }, user);
  }

  @Get('from-enquiry/:enquiryId')
  @RequirePermissions(PERMISSIONS.QUOTATION_CREATE)
  @ApiOperation({ summary: 'Enquiry details and readiness check used to pre-fill a new quotation' })
  fromEnquiry(@Param('enquiryId', uuid()) enquiryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.quotations.enquiryConvertData(enquiryId, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Create a quotation from an enquiry (quotation.create) or manually (quotation.create_manual)' })
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.quotations.create(dto, user, contextOf(request));
  }

  // --- Single quotation -------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Quotation with all revisions, status history, communication and documents' })
  findOne(@Param('id', uuid()) id: string) {
    return this.quotations.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Activity history from the audit log' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.quotations.activity(id, pagination);
  }

  @Patch(':id/draft')
  @RequirePermissions(PERMISSIONS.QUOTATION_UPDATE)
  @ApiOperation({ summary: 'Replace the content of the current draft revision (issued revisions are frozen)' })
  updateDraft(@Param('id', uuid()) id: string, @Body() dto: UpdateDraftDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.quotations.updateDraft(id, dto, user, contextOf(request));
  }

  @Post(':id/revisions')
  @RequirePermissions(PERMISSIONS.QUOTATION_REVISE)
  @ApiOperation({ summary: 'Start a new draft revision as a copy of the current one; the previous one is superseded' })
  createRevision(@Param('id', uuid()) id: string, @Body() dto: CreateRevisionDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.quotations.createRevision(id, dto.remarks, user, contextOf(request));
  }

  @Get(':id/compare')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Differences between two revisions' })
  compare(@Param('id', uuid()) id: string, @Query() query: CompareQueryDto) {
    if (query.from === query.to) throw new BadRequestException('Choose two different revisions.');
    return this.quotations.compare(id, query.from, query.to);
  }

  @Get(':id/revisions/:revisionNumber')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'One revision exactly as stored' })
  revision(@Param('id', uuid()) id: string, @Param('revisionNumber', ParseIntPipe) revisionNumber: number) {
    return this.quotations.revision(id, revisionNumber);
  }

  @Get(':id/revisions/:revisionNumber/pdf')
  @RequirePermissions(PERMISSIONS.QUOTATION_DOWNLOAD)
  @ApiOperation({ summary: 'A4 PDF of a revision (issued: the stored document; not issued: a DRAFT preview)' })
  async revisionPdf(
    @Param('id', uuid()) id: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    await this.quotations.revision(id, revisionNumber); // 404 for unknown revisions
    sendStoredFile(response, await this.pdf.open(id, revisionNumber, user));
  }

  @Post(':id/revisions/:revisionNumber/email')
  @RequirePermissions(PERMISSIONS.QUOTATION_SEND)
  @ApiOperation({ summary: 'Email an issued revision as a PDF attachment from the administrator address' })
  sendEmail(
    @Param('id', uuid()) id: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
    @Body() dto: SendQuotationEmailDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.quotationEmails.send(id, revisionNumber, dto, user, contextOf(request));
  }

  @Get(':id/emails')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Email history of a quotation, newest first' })
  emailHistory(@Param('id', uuid()) id: string) {
    return this.quotationEmails.history(id);
  }

  @Get(':id/email-recipients')
  @RequirePermissions(PERMISSIONS.QUOTATION_SEND)
  @ApiOperation({ summary: 'Customers or vendors to email, with their saved address' })
  emailRecipients(
    @Param('id', uuid()) id: string,
    @Query() query: RecipientSearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationEmails.recipients(id, query, user.permissions);
  }

  @Get(':id/revisions/:revisionNumber/proforma-handoff')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Proforma Invoice hand-off contract for the accepted revision (creates nothing)' })
  proformaHandoff(@Param('id', uuid()) id: string, @Param('revisionNumber', ParseIntPipe) revisionNumber: number) {
    return this.quotations.proformaHandoff(id, revisionNumber);
  }

  @Post(':id/status')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Move the current revision through the lifecycle (each step checks its own permission)' })
  changeStatus(@Param('id', uuid()) id: string, @Body() dto: StatusActionDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.quotations.changeStatus(id, dto, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.QUOTATION_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a never-issued draft (the enquiry returns to Ready for Quotation)' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.quotations.remove(id, user, contextOf(request));
  }

  @Post(':id/communications')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Log a customer communication (a record of what happened; nothing is sent)' })
  addCommunication(@Param('id', uuid()) id: string, @Body() dto: CommunicationDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.quotations.addCommunication(id, dto, user, contextOf(request));
  }

  // --- Documents ----------------------------------------------------------------

  @Post(':id/documents')
  @RequirePermissions(PERMISSIONS.QUOTATION_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Attach a customer document or supporting file (type verified from the bytes)' })
  async upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadQuotationDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.quotations.findOne(id);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? DocumentKind.QUOTATION_ATTACHMENT, quotationId: id }, user);
  }

  @Post(':id/documents/:documentId/replace')
  @RequirePermissions(PERMISSIONS.QUOTATION_UPDATE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace an attached document (old version archived and linked)' })
  async replace(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadQuotationDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const current = await this.ownedUpload(id, documentId);
    return this.documents.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: dto.kind ?? current.kind, quotationId: id, replacesDocumentId: current.id }, user);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.QUOTATION_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an attached document (soft; generated PDFs cannot be removed)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.ownedUpload(id, documentId);
    await this.documents.archive(documentId, user);
  }

  @Get(':id/documents/:documentId/content')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ, PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a quotation document' })
  async content(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.documents.findActive(documentId);
    if (document.quotationId !== id) throw new NotFoundException(`Document ${documentId} was not found`);
    if (document.kind === DocumentKind.QUOTATION_PDF && !user.permissions.includes(PERMISSIONS.QUOTATION_DOWNLOAD)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    sendStoredFile(response, await this.documents.openForDownload(documentId, user, { preview: preview === 'true' }));
  }

  /** Uploaded (not generated) documents of this quotation. */
  private async ownedUpload(quotationId: string, documentId: string) {
    const document = await this.documents.findActive(documentId);
    if (document.quotationId !== quotationId || !(QUOTATION_UPLOAD_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document;
  }
}
