import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { resolvePeriod, RANGE_PRESETS, type RangePreset } from '../analytics/analytics-range';
import { reportTables, toCsvExport, toPdfExport, toXlsxExport } from '../analytics/analytics-export';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import type { PdfCompanyProfile } from '../common/pdf/commercial-pdf';
import { SALES_VIEWS, SalesService, type SalesScope, type SalesView } from './sales.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SalesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RANGE_PRESETS, description: 'Period. Defaults depend on the endpoint.' })
  @IsOptional()
  @IsIn(RANGE_PRESETS)
  preset?: RangePreset;

  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @Matches(DATE) dateFrom?: string;
  @ApiPropertyOptional({ example: '2026-01-31' }) @IsOptional() @Matches(DATE) dateTo?: string;

  @ApiPropertyOptional({ enum: SALES_VIEWS, default: 'latest' })
  @IsOptional()
  @IsIn(SALES_VIEWS)
  view?: SalesView;

  @ApiPropertyOptional() @IsOptional() @IsUUID('4') productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;

  @ApiPropertyOptional({ description: 'Product, model, code, customer name or invoice number' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class MonthlyQueryDto {
  @ApiPropertyOptional({ default: 12 }) @IsOptional() @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1) @Max(24) months?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
}

export class SalesExportQueryDto extends SalesQueryDto {
  @ApiPropertyOptional({ enum: ['history', 'topSellers', 'monthly', 'comparison'], default: 'history' })
  @IsOptional()
  @IsIn(['history', 'topSellers', 'monthly', 'comparison'])
  report?: 'history' | 'topSellers' | 'monthly' | 'comparison';

  @ApiPropertyOptional({ enum: ['csv', 'xlsx', 'pdf'], default: 'xlsx' })
  @IsOptional()
  @IsIn(['csv', 'xlsx', 'pdf'])
  format?: 'csv' | 'xlsx' | 'pdf';
}

/** Sales analytics needs both product and invoice analytics permissions, the same as the Reports module. */
const SALES_PERMISSIONS: PermissionCode[] = [PERMISSIONS.ANALYTICS_PRODUCTS, PERMISSIONS.ANALYTICS_INVOICES];

function assertSalesAccess(user: AuthenticatedUser, extra: PermissionCode[] = []) {
  const missing = [...SALES_PERMISSIONS, ...extra].filter((p) => !user.permissions.includes(p));
  if (missing.length) throw new ForbiddenException('You do not have permission to view sales history.');
}

function scopeFrom(q: SalesQueryDto, defaultPreset: RangePreset) {
  const period = resolvePeriod(q.preset ?? defaultPreset, q.dateFrom, q.dateTo);
  return {
    period,
    scope: { period, productId: q.productId, customerId: q.customerId, search: q.search } as SalesScope,
  };
}

@ApiTags('Sales history')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Sold-products history. `view` picks the ordering or grouping: latest and
   * oldest sales (line by line), product-wise or customer-wise totals.
   */
  @Get('history')
  @RequirePermissions(PERMISSIONS.ANALYTICS_PRODUCTS)
  @ApiOperation({ summary: 'Sold products history from issued and sent final invoices' })
  async history(@Query() q: SalesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    assertSalesAccess(user);
    const { period, scope } = scopeFrom(q, 'all');
    const view: SalesView = q.view ?? 'latest';
    const page = q.page;
    const pageSize = q.pageSize;
    const [result, totals] = await Promise.all([
      view === 'latest' || view === 'oldest'
        ? this.sales.lines(scope, view === 'oldest' ? 'asc' : 'desc', page, pageSize)
        : this.sales.grouped(scope, view, page, pageSize),
      this.sales.totals(scope),
    ]);
    return {
      period: { preset: period.preset, label: period.label, from: period.from?.toISOString().slice(0, 10) ?? null, to: period.to.toISOString().slice(0, 10) },
      view,
      totals,
      items: result.items,
      meta: {
        page,
        pageSize,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / pageSize),
        hasNextPage: page * pageSize < result.total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /** Top products this month by quantity, by value and by number of orders. */
  @Get('top-sellers')
  @RequirePermissions(PERMISSIONS.ANALYTICS_PRODUCTS)
  @ApiOperation({ summary: 'Top-selling products for the period (default: this month)' })
  async topSellers(@Query() q: SalesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    assertSalesAccess(user);
    const { period, scope } = scopeFrom(q, 'thisMonth');
    return { period: { preset: period.preset, label: period.label }, ...(await this.sales.topSellers(scope)) };
  }

  /** Sales per calendar month, for the monthly summary. */
  @Get('monthly')
  @RequirePermissions(PERMISSIONS.ANALYTICS_PRODUCTS)
  @ApiOperation({ summary: 'Monthly sales summary for the last N months' })
  async monthly(@Query() q: MonthlyQueryDto, @CurrentUser() user: AuthenticatedUser) {
    assertSalesAccess(user);
    const months = q.months ?? 12;
    const to = resolvePeriod('thisMonth').to;
    return { months, rows: await this.sales.monthly(to, months, { productId: q.productId, customerId: q.customerId }) };
  }

  /** Product-wise comparison of this month with the previous month (or any period you choose). */
  @Get('comparison')
  @RequirePermissions(PERMISSIONS.ANALYTICS_PRODUCTS)
  @ApiOperation({ summary: 'Product sales compared with the previous period' })
  async comparison(@Query() q: SalesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    assertSalesAccess(user);
    const { period, scope } = scopeFrom(q, 'thisMonth');
    const result = await this.sales.comparison(period, { productId: scope.productId, customerId: scope.customerId, search: scope.search });
    return { period: { preset: period.preset, label: period.label }, ...result };
  }

  /** Excel, CSV or PDF of the same figures shown on screen. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.ANALYTICS_EXPORT)
  @ApiOperation({ summary: 'Export sales history or a sales summary as Excel, CSV or PDF' })
  async export(@Query() q: SalesExportQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    assertSalesAccess(user);
    const report = q.report ?? 'history';
    const format = q.format ?? 'xlsx';
    const { period, scope } = scopeFrom(q, report === 'history' ? 'all' : 'thisMonth');

    let data: Record<string, unknown>;
    if (report === 'history') {
      const view: SalesView = q.view ?? 'latest';
      const lines = view === 'latest' || view === 'oldest' ? await this.sales.exportLines(scope) : null;
      const rows = lines
        ? lines.items
        : (await this.sales.grouped(scope, view as 'product' | 'customer', 1, 5000)).items;
      data = { totals: await this.sales.totals(scope), sales: rows };
    } else if (report === 'topSellers') {
      data = await this.sales.topSellers(scope);
    } else if (report === 'monthly') {
      data = { monthly: await this.sales.monthly(period.to, 12, { productId: scope.productId, customerId: scope.customerId }) };
    } else {
      const comparison = await this.sales.comparison(period, { productId: scope.productId, customerId: scope.customerId, search: scope.search });
      data = { comparison: comparison.rows, previousPeriod: comparison.previousPeriodLabel };
    }

    const company = ((await this.settings.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const meta = {
      title: 'Sales history',
      period: period.label,
      filters: [q.productId && `product ${q.productId}`, q.customerId && `customer ${q.customerId}`, q.search && `search "${q.search}"`].filter(Boolean) as string[],
      generatedAt: new Date(),
      company,
    };
    const tables = reportTables(data);
    const base = `sales-${report}-${period.label.replace(/[^0-9a-z]+/gi, '_')}`;

    if (format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      response.send(toCsvExport(meta, tables));
      return;
    }
    if (format === 'pdf') {
      const pdf = await toPdfExport(meta, tables);
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      response.send(pdf);
      return;
    }
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    response.send(toXlsxExport(meta, tables));
  }
}
