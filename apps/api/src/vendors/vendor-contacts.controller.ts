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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { VendorContactsService } from './vendor-contacts.service';
import { VendorContactInputDto } from './dto/create-vendor.dto';
import { UpdateVendorContactDto } from './dto/vendor-children.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { contextOf } from './vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Vendor contacts')
@ApiBearerAuth()
@Controller('vendors/:vendorId/contacts')
export class VendorContactsController {
  constructor(private readonly contactsService: VendorContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'List contact persons for a vendor' })
  async list(@Param('vendorId', uuid()) vendorId: string) {
    return this.contactsService.list(vendorId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_CONTACTS)
  @ApiOperation({
    summary: 'Add a contact person',
    description:
      'The first contact of a type becomes its primary. isPrimary=true demotes ' +
      'the previous primary of the same type.',
  })
  async create(
    @Param('vendorId', uuid()) vendorId: string,
    @Body() dto: VendorContactInputDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contactsService.create(vendorId, dto, user, contextOf(request));
  }

  @Patch(':contactId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_CONTACTS)
  @ApiOperation({ summary: 'Update a contact person' })
  async update(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('contactId', uuid()) contactId: string,
    @Body() dto: UpdateVendorContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contactsService.update(vendorId, contactId, dto, user, contextOf(request));
  }

  @Delete(':contactId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_CONTACTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a contact person' })
  async remove(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('contactId', uuid()) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.contactsService.remove(vendorId, contactId, user, contextOf(request));
  }
}
