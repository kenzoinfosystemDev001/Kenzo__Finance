import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('Audit log')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Search the audit log, newest first (paginated, max 100 per page)' })
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogs.list(query);
  }

  @Get('facets')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Entity types and actions present in the audit log (filter options)' })
  facets() {
    return this.auditLogs.facets();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'One audit entry with its before/after values' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditLogs.findOne(id);
  }
}
