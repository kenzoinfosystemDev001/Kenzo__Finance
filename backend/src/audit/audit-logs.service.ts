import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { buildPaginatedResult } from '../common/dto/pagination.dto';
import { businessDayEnd, businessDayStart } from '../common/utils/business-date';
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export const AUDIT_MAX_PAGE_SIZE = 100;
export const AUDIT_DEFAULT_PAGE_SIZE = 25;

const LIST_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  parentEntityType: true,
  parentEntityId: true,
  summary: true,
  ipAddress: true,
  createdAt: true,
  actor: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

/** Page and page size as integers inside the allowed range. */
export function clampPagination(page?: number, pageSize?: number): { page: number; pageSize: number } {
  const p = typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const size =
    typeof pageSize === 'number' && Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : AUDIT_DEFAULT_PAGE_SIZE;
  return { page: p, pageSize: Math.min(size, AUDIT_MAX_PAGE_SIZE) };
}

/** Prisma filter for the audit log list. Dates are business days, both ends inclusive. */
export function buildAuditWhere(query: Partial<QueryAuditLogsDto>): Prisma.AuditLogWhereInput {
  if (query.from && query.to && query.from > query.to) {
    throw new BadRequestException('The start date must be on or before the end date');
  }
  const and: Prisma.AuditLogWhereInput[] = [];
  if (query.entityType) and.push({ entityType: query.entityType });
  if (query.action) {
    and.push(query.action.endsWith('.') ? { action: { startsWith: query.action } } : { action: query.action });
  }
  if (query.actorUserId) and.push({ actorUserId: query.actorUserId });
  if (query.from || query.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = businessDayStart(query.from);
    // Inclusive: everything before the start of the following business day.
    if (query.to) createdAt.lt = businessDayEnd(query.to);
    and.push({ createdAt });
  }
  if (query.search) and.push({ summary: { contains: query.search, mode: 'insensitive' } });
  return and.length ? { AND: and } : {};
}

/** Read side of the audit log; writes go through AuditService.record. */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryAuditLogsDto) {
    const { page, pageSize } = clampPagination(query.page, query.pageSize);
    const where = buildAuditWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        // id breaks ties between rows written in the same millisecond, so pages never overlap.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const entry = await this.prisma.auditLog.findUnique({
      where: { id },
      select: { ...LIST_SELECT, before: true, after: true, userAgent: true },
    });
    if (!entry) throw new NotFoundException(`Audit entry ${id} was not found`);
    return entry;
  }

  /** Distinct entity types and actions, for the filter pickers. */
  async facets() {
    const [entityTypes, actions] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);
    return { entityTypes: entityTypes.map((r) => r.entityType), actions: actions.map((r) => r.action) };
  }
}
