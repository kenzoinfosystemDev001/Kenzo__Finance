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
import { EnquiriesService } from './enquiries.service';
import { EnquiryChildrenService } from './enquiry-children.service';
import {
  AssignEnquiryDto,
  ChangeStatusDto,
  CreateEnquiryDto,
  ENQUIRY_DOCUMENT_KINDS,
  EnquiryItemInputDto,
  EnquirySourceDto,
  FollowUpInputDto,
  FollowUpQueryDto,
  QueryEnquiriesDto,
  UpdateEnquiryDto,
  UpdateEnquiryItemDto,
  UpdateEnquirySourceDto,
  UpdateFollowUpDto,
  UploadEnquiryDocumentDto,
} from './dto/enquiry.dto';
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
    properties: { file: { type: 'string', format: 'binary' }, kind: { type: 'string', enum: [...ENQUIRY_DOCUMENT_KINDS] } },
  },
};
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

@ApiTags('Enquiries')
@ApiBearerAuth()
@Controller('enquiries')
export class EnquiriesController {
  constructor(
    private readonly enquiries: EnquiriesService,
    private readonly children: EnquiryChildrenService,
  ) {}

  // --- Collection routes (before :id) -----------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Search, filter, sort and paginate enquiries' })
  findAll(@Query() query: QueryEnquiriesDto) {
    return this.enquiries.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Dashboard figures counted from live records' })
  summary() {
    return this.enquiries.summary();
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Active users who can be assigned (existing users; no separate employee master)' })
  assignees() {
    return this.enquiries.assignableUsers();
  }

  @Get('follow-ups')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Follow-up board: today, upcoming, overdue (by next follow-up) or completed' })
  followUpBoard(@Query() query: FollowUpQueryDto) {
    return this.children.followUpBoard(query);
  }

  @Get('follow-ups/counts')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiOperation({ summary: 'Counts for the follow-up board' })
  followUpCounts(@Query('assignedToId') assignedToId?: string) {
    return this.children.followUpCounts(assignedToId && /^[0-9a-f-]{36}$/i.test(assignedToId) ? assignedToId : undefined);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.ENQUIRY_EXPORT)
  @ApiOperation({ summary: 'Export the filtered enquiry list as CSV' })
  async export(@Query() query: QueryEnquiriesDto, @Res() response: Response): Promise<void> {
    const rows = await this.enquiries.findAllForExport(query);
    const csv = toCsv(
      rows.map((e) => ({
        'Enquiry ID': e.enquiryNumber,
        'Enquiry Date': day(e.enquiryDate),
        Customer: e.customer.name,
        'Customer Code': e.customer.customerCode,
        'Customer Type': e.customer.customerType,
        Contact: e.customerContact?.name ?? '',
        Products: e.items.map((i) => `${i.product.name}${i.productModel ? ` ${i.productModel.modelName}` : ''} x${i.quantity} ${i.unit}`).join('; '),
        Source: e.source?.name ?? '',
        'Assigned To': e.assignedTo?.fullName ?? '',
        Priority: e.priority,
        Status: e.status,
        'Next Follow-up': day(e.nextFollowUpDate),
        'Expected Decision': day(e.expectedDecisionDate),
        'Expected Budget': e.expectedBudget ? `${e.currency} ${e.expectedBudget.toString()}` : '',
      })),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send('﻿' + csv);
  }

  @Get('sources')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Enquiry sources (configurable)' })
  listSources(@Query('includeInactive') includeInactive?: string) {
    return this.enquiries.listSources(includeInactive === 'true');
  }

  @Post('sources')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Create an enquiry source' })
  createSource(@Body() dto: EnquirySourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enquiries.createSource(dto, user);
  }

  @Patch('sources/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Rename, describe or (de)activate an enquiry source' })
  updateSource(@Param('id', uuid()) id: string, @Body() dto: UpdateEnquirySourceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.enquiries.updateSource(id, dto, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ENQUIRY_CREATE)
  @ApiOperation({
    summary: 'Create an enquiry for an existing customer with existing products/models',
    description: 'Inactive customers/products are refused unless the user may use them. Nothing is created in other modules.',
  })
  create(@Body() dto: CreateEnquiryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.enquiries.create(dto, user, contextOf(request));
  }

  // --- Single enquiry ---------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Enquiry with customer, items, follow-ups, status history and attachments' })
  findOne(@Param('id', uuid()) id: string) {
    return this.enquiries.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Activity history from the audit log' })
  activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.enquiries.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPDATE)
  @ApiOperation({ summary: 'Update enquiry details (not allowed once converted, lost or closed)' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateEnquiryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.enquiries.update(id, dto, user, contextOf(request));
  }

  @Patch(':id/assign')
  @RequirePermissions(PERMISSIONS.ENQUIRY_ASSIGN)
  @ApiOperation({ summary: 'Assign or unassign an employee (assigning a New enquiry marks it Assigned)' })
  assign(@Param('id', uuid()) id: string, @Body() dto: AssignEnquiryDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.enquiries.assign(id, dto, user, contextOf(request));
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.ENQUIRY_CHANGE_STATUS)
  @ApiOperation({ summary: 'Change status along an allowed transition; some need a reason' })
  changeStatus(@Param('id', uuid()) id: string, @Body() dto: ChangeStatusDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.enquiries.changeStatus(id, dto, user, contextOf(request));
  }

  @Get(':id/conversion')
  @RequirePermissions(PERMISSIONS.ENQUIRY_CONVERT)
  @ApiOperation({ summary: 'Validate conversion and return the hand-off data for Quotation Management' })
  conversion(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.enquiries.conversionHandoff(id, user);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an enquiry without history (409 otherwise)' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.enquiries.remove(id, user, contextOf(request));
  }

  // --- Items ------------------------------------------------------------------

  @Get(':id/items')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Product requirements' })
  listItems(@Param('id', uuid()) id: string) {
    return this.children.listItems(id);
  }

  @Post(':id/items')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPDATE)
  @ApiOperation({ summary: 'Add a product requirement (existing product/model only)' })
  addItem(@Param('id', uuid()) id: string, @Body() dto: EnquiryItemInputDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.addItem(id, dto, user, contextOf(request));
  }

  // --- Follow-ups -------------------------------------------------------------

  @Get(':id/follow-ups')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ)
  @ApiOperation({ summary: 'Follow-up history, newest first' })
  listFollowUps(@Param('id', uuid()) id: string) {
    return this.children.listFollowUps(id);
  }

  @Post(':id/follow-ups')
  @RequirePermissions(PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS)
  @ApiOperation({ summary: 'Record a follow-up (updates the next follow-up date)' })
  addFollowUp(@Param('id', uuid()) id: string, @Body() dto: FollowUpInputDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.addFollowUp(id, dto, user, contextOf(request));
  }

  // --- Attachments ------------------------------------------------------------

  @Get(':id/attachments')
  @RequirePermissions(PERMISSIONS.ENQUIRY_READ, PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'Current attachments' })
  listDocuments(@Param('id', uuid()) id: string) {
    return this.children.listDocuments(id);
  }

  @Post(':id/attachments')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Upload an attachment (type verified from the bytes, stored privately)' })
  upload(@Param('id', uuid()) id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadEnquiryDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.children.uploadDocument(id, file, dto.kind, user);
  }

  @Post(':id/attachments/:documentId/replace')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPLOAD_ATTACHMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @ApiOperation({ summary: 'Replace an attachment (old version archived and linked)' })
  replace(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadEnquiryDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.children.replaceDocument(id, documentId, file, dto.kind, user);
  }

  @Delete(':id/attachments/:documentId')
  @RequirePermissions(PERMISSIONS.ENQUIRY_DELETE_ATTACHMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an attachment (soft; kept for audit)' })
  async removeDocument(@Param('id', uuid()) id: string, @Param('documentId', uuid()) documentId: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.children.removeDocument(id, documentId, user);
  }

  @Get(':id/attachments/:documentId/content')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview an attachment' })
  async content(
    @Param('id', uuid()) id: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    sendStoredFile(response, await this.children.openDocument(id, documentId, user, preview === 'true'));
  }
}

/** Item and follow-up rows addressed by their own id. */
@ApiTags('Enquiries')
@ApiBearerAuth()
@Controller()
export class EnquiryRowsController {
  constructor(private readonly children: EnquiryChildrenService) {}

  @Patch('enquiry-items/:id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPDATE)
  @ApiOperation({ summary: 'Update a product requirement (change history kept in the audit log)' })
  updateItem(@Param('id', uuid()) id: string, @Body() dto: UpdateEnquiryItemDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.updateItem(id, dto, user, contextOf(request));
  }

  @Delete('enquiry-items/:id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a product requirement (an enquiry keeps at least one)' })
  async removeItem(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.children.removeItem(id, user, contextOf(request));
  }

  @Patch('enquiry-follow-ups/:id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS)
  @ApiOperation({ summary: 'Edit a follow-up (previous values kept in the audit log)' })
  updateFollowUp(@Param('id', uuid()) id: string, @Body() dto: UpdateFollowUpDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.children.updateFollowUp(id, dto, user, contextOf(request));
  }

  @Delete('enquiry-follow-ups/:id')
  @RequirePermissions(PERMISSIONS.ENQUIRY_MANAGE_FOLLOW_UPS, PERMISSIONS.ENQUIRY_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a follow-up (full record kept in the audit log)' })
  async removeFollowUp(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request): Promise<void> {
    await this.children.removeFollowUp(id, user, contextOf(request));
  }
}
