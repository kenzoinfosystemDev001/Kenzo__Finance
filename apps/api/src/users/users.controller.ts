import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { contextOf } from '../vendors/vendor-shared';
import { UsersService } from './users.service';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, RolePermissionsDto, UpdateUserDto, UserStatusReasonDto } from './dto/user.dto';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Users & Roles')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Search users (never returns password hashes)' })
  findAll(@Query() query: QueryUsersDto) {
    return this.users.findAll(query);
  }

  @Get('users/summary')
  @RequirePermissions(PERMISSIONS.USER_READ)
  summary() {
    return this.users.summary();
  }

  @Post('users')
  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @ApiOperation({ summary: 'Create a user with an initial password and roles (no access beyond your own can be granted)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.create(dto, actor, contextOf(req));
  }

  @Get('users/:id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  findOne(@Param('id', uuid()) id: string) {
    return this.users.findOne(id);
  }

  @Get('users/:id/activity')
  @RequirePermissions(PERMISSIONS.USER_READ)
  activity(@Param('id', uuid()) id: string, @Query() q: PaginationQueryDto) {
    return this.users.activity(id, q.page, q.pageSize);
  }

  @Patch('users/:id')
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @ApiOperation({ summary: 'Edit name/phone and roles' })
  update(@Param('id', uuid()) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.update(id, dto, actor, contextOf(req));
  }

  @Post('users/:id/deactivate')
  @RequirePermissions(PERMISSIONS.USER_ARCHIVE)
  @ApiOperation({ summary: 'Deactivate: blocks sign-in and revokes every session immediately' })
  deactivate(@Param('id', uuid()) id: string, @Body() dto: UserStatusReasonDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.setStatus(id, false, dto.reason, actor, contextOf(req));
  }

  @Post('users/:id/activate')
  @RequirePermissions(PERMISSIONS.USER_ARCHIVE)
  @ApiOperation({ summary: 'Reactivate (also clears a login lockout)' })
  activate(@Param('id', uuid()) id: string, @Body() dto: UserStatusReasonDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.setStatus(id, true, dto.reason, actor, contextOf(req));
  }

  @Post('users/:id/reset-password')
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @ApiOperation({ summary: "Set a new password for another user; revokes that user's sessions" })
  resetPassword(@Param('id', uuid()) id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.resetPassword(id, dto.password, actor, contextOf(req));
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  roles() {
    return this.users.roles();
  }

  @Get('roles/permissions')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  permissionCatalogue() {
    return this.users.permissionCatalogue();
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: "Replace a role's permissions (Super Admin role is fixed; no granting or revoking access you lack)" })
  setRolePermissions(@Param('id', uuid()) id: string, @Body() dto: RolePermissionsDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.setRolePermissions(id, dto.permissionCodes, actor, contextOf(req));
  }
}
