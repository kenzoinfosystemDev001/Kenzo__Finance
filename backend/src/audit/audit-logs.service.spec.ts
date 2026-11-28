import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditLogsService, buildAuditWhere, clampPagination, AUDIT_MAX_PAGE_SIZE } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import type { PrismaService } from '../database/prisma.service';

const ACTOR = '11111111-1111-4111-8111-111111111111';

function query(input: Record<string, unknown>): QueryAuditLogsDto {
  return plainToInstance(QueryAuditLogsDto, input);
}

describe('clampPagination', () => {
  it('defaults page and page size', () => {
    expect(clampPagination(undefined, undefined)).toEqual({ page: 1, pageSize: 25 });
  });

  it('caps the page size at the maximum', () => {
    expect(clampPagination(2, 5000)).toEqual({ page: 2, pageSize: AUDIT_MAX_PAGE_SIZE });
  });

  it('replaces invalid values with safe ones', () => {
    expect(clampPagination(0, -3)).toEqual({ page: 1, pageSize: 25 });
    expect(clampPagination(Number.NaN, Number.NaN)).toEqual({ page: 1, pageSize: 25 });
    expect(clampPagination(3.7, 10.2)).toEqual({ page: 3, pageSize: 10 });
  });
});

describe('buildAuditWhere', () => {
  const OLD_TZ = process.env.BUSINESS_TIMEZONE;
  beforeAll(() => {
    process.env.BUSINESS_TIMEZONE = 'Asia/Kolkata';
  });
  afterAll(() => {
    process.env.BUSINESS_TIMEZONE = OLD_TZ;
  });

  it('returns an empty filter when nothing is set', () => {
    expect(buildAuditWhere({})).toEqual({});
  });

  it('combines every filter', () => {
    const where = buildAuditWhere({
      entityType: 'Vendor',
      action: 'vendor.create',
      actorUserId: ACTOR,
      from: '2026-11-20',
      to: '2026-11-21',
      search: 'shree',
    });
    expect(where).toEqual({
      AND: [
        { entityType: 'Vendor' },
        { action: 'vendor.create' },
        { actorUserId: ACTOR },
        // 20 Nov 00:00 IST to the start of 22 Nov IST (exclusive).
        { createdAt: { gte: new Date('2026-11-19T18:30:00.000Z'), lt: new Date('2026-11-21T18:30:00.000Z') } },
        { summary: { contains: 'shree', mode: 'insensitive' } },
      ],
    });
  });

  it('treats an action ending in a dot as a prefix', () => {
    expect(buildAuditWhere({ action: 'auth.' })).toEqual({ AND: [{ action: { startsWith: 'auth.' } }] });
  });

  it('supports open-ended date ranges', () => {
    expect(buildAuditWhere({ from: '2026-11-20' })).toEqual({
      AND: [{ createdAt: { gte: new Date('2026-11-19T18:30:00.000Z') } }],
    });
    expect(buildAuditWhere({ to: '2026-11-20' })).toEqual({
      AND: [{ createdAt: { lt: new Date('2026-11-20T18:30:00.000Z') } }],
    });
  });

  it('rejects a reversed date range', () => {
    expect(() => buildAuditWhere({ from: '2026-11-21', to: '2026-11-20' })).toThrow(BadRequestException);
  });
});

describe('QueryAuditLogsDto', () => {
  it('accepts valid filters', async () => {
    const dto = query({ page: '2', pageSize: '50', entityType: ' Vendor ', from: '2026-11-01', to: '2026-11-30', actorUserId: ACTOR });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(dto.entityType).toBe('Vendor');
    expect(dto.page).toBe(2);
  });

  it('rejects page sizes above 100, bad dates and unknown fields', async () => {
    const errors = await validate(query({ pageSize: '500', from: '2026-13-01', actorUserId: 'nope', foo: 'bar' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((e) => e.property).sort()).toEqual(['actorUserId', 'foo', 'from', 'pageSize']);
  });
});

describe('AuditLogsService', () => {
  let prisma: { auditLog: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock }; $transaction: jest.Mock };
  let service: AuditLogsService;

  beforeEach(() => {
    prisma = {
      auditLog: { findMany: jest.fn().mockReturnValue('rows'), count: jest.fn().mockReturnValue('count'), findUnique: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[{ id: 'a1' }], 120]),
    };
    service = new AuditLogsService(prisma as unknown as PrismaService);
  });

  it('pages newest first with the clamped size and returns pagination meta', async () => {
    const result = await service.list(query({ page: 3, pageSize: 500, entityType: 'Vendor' }));
    const args = prisma.auditLog.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBe(100);
    expect(args.skip).toBe(200);
    expect(args.where).toEqual({ AND: [{ entityType: 'Vendor' }] });
    expect(args.select.actor).toEqual({ select: { id: true, fullName: true, email: true } });
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: args.where });
    expect(result.meta).toEqual({ page: 3, pageSize: 100, totalItems: 120, totalPages: 2, hasNextPage: false, hasPreviousPage: true });
  });

  it('returns before/after for one entry and 404s when missing', async () => {
    prisma.auditLog.findUnique.mockResolvedValueOnce({ id: 'a1', before: { a: 1 }, after: { a: 2 } });
    await expect(service.findOne('a1')).resolves.toMatchObject({ before: { a: 1 }, after: { a: 2 } });
    expect(prisma.auditLog.findUnique.mock.calls[0][0].select).toMatchObject({ before: true, after: true });

    prisma.auditLog.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});
