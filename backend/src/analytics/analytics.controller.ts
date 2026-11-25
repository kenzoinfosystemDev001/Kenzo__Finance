import { Controller, ForbiddenException, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { AnalyticsService, type Filters } from './analytics.service';
import { RANGE_PRESETS, resolvePeriod, type RangePreset } from './analytics-range';
import { reportTables, toCsvExport, toPdfExport, toXlsxExport } from './analytics-export';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { PdfCompanyProfile } from '../common/pdf/commercial-pdf';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: RANGE_PRESETS, default: 'thisMonth' }) @IsOptional() @IsIn(RANGE_PRESETS) preset: RangePreset = 'thisMonth';
  @ApiPropertyOptional({ description: 'With preset=custom' }) @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional({ description: 'With preset=custom' }) @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') productId?: string;
  @ApiPropertyOptional({ description: 'Employee (enquiry reports)' }) @IsOptional() @IsUUID('4') assignedToId?: string;
  @ApiPropertyOptional({ description: 'Ageing bucket edges in days, comma-separated (default 30,60,90)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean).map(Number) : value))
  @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(3650, { each: true })
  buckets?: number[];
}

export const REPORTS = ['overview', 'sales', 'customers', 'vendors', 'products', 'enquiries', 'quotations', 'proforma', 'invoices', 'payments', 'deliveries', 'insights'] as const;
type Report = (typeof REPORTS)[number];

export class ExportQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: REPORTS }) @IsIn(REPORTS) report!: Report;
  @ApiPropertyOptional({ enum: ['csv', 'xlsx', 'pdf'], default: 'xlsx' }) @IsOptional() @IsIn(['csv', 'xlsx', 'pdf']) format: 'csv' | 'xlsx' | 'pdf' = 'xlsx';
}

/** Permission per report; invoice and payment analytics are financial by nature. */
const REPORT_PERMISSION: Record<Report, PermissionCode[]> = {
  overview: [PERMISSIONS.ANALYTICS_DASHBOARD],
  insights: [PERMISSIONS.ANALYTICS_DASHBOARD],
  sales: [PERMISSIONS.ANALYTICS_INVOICES, PERMISSIONS.ANALYTICS_FINANCIAL],
  customers: [PERMISSIONS.ANALYTICS_CUSTOMERS],
  vendors: [PERMISSIONS.ANALYTICS_VENDORS],
  products: [PERMISSIONS.ANALYTICS_PRODUCTS],
  enquiries: [PERMISSIONS.ANALYTICS_ENQUIRIES],
  quotations: [PERMISSIONS.ANALYTICS_QUOTATIONS],
  proforma: [PERMISSIONS.ANALYTICS_PROFORMA],
  invoices: [PERMISSIONS.ANALYTICS_INVOICES, PERMISSIONS.ANALYTICS_FINANCIAL],
  payments: [PERMISSIONS.ANALYTICS_PAYMENTS, PERMISSIONS.ANALYTICS_FINANCIAL],
  deliveries: [PERMISSIONS.ANALYTICS_DELIVERIES],
};
const TITLES: Record<Report, string> = {
  overview: 'Executive Overview', insights: 'Executive Summary', sales: 'Sales Analytics', customers: 'Customer Analytics', vendors: 'Vendor Analytics',
  products: 'Product Analytics', enquiries: 'Enquiry Analytics', quotations: 'Quotation Analytics', proforma: 'Proforma Invoice Analytics',
  invoices: 'Final Invoice Analytics', payments: 'Payment Analytics', deliveries: 'Delivery Analytics',
};

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly settings: SettingsService,
  ) {}

  private filters(q: AnalyticsQueryDto): Filters {
    return { period: resolvePeriod(q.preset, q.dateFrom, q.dateTo), customerId: q.customerId, productId: q.productId, assignedToId: q.assignedToId };
  }

  private financial(user: AuthenticatedUser) {
    return user.permissions.includes(PERMISSIONS.ANALYTICS_FINANCIAL);
  }

  private run(report: Report, q: AnalyticsQueryDto, user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const missing = REPORT_PERMISSION[report].filter((p) => !user.permissions.includes(p));
    if (missing.length) throw new ForbiddenException(`You do not have permission to view ${TITLES[report].toLowerCase()}.`);
    const f = this.filters(q);
    const fin = this.financial(user);
    switch (report) {
      case 'overview': return this.analytics.overview(f, fin);
      case 'insights': return this.analytics.insights(f, fin);
      case 'sales': return this.analytics.sales(f);
      case 'customers': return this.analytics.customers(f, fin);
      case 'vendors': return this.analytics.vendors(f);
      case 'products': return this.analytics.products(f);
      case 'enquiries': return this.analytics.enquiries(f);
      case 'quotations': return this.analytics.quotations(f, fin);
      case 'proforma': return this.analytics.proforma(f, fin);
      case 'invoices': return this.analytics.invoices(f, q.buckets);
      case 'payments': return this.analytics.payments(f);
      case 'deliveries': return this.analytics.deliveries(f);
    }
  }

  @Get('overview') @RequirePermissions(PERMISSIONS.ANALYTICS_DASHBOARD) @ApiOperation({ summary: 'Executive KPIs and business performance (money only with analytics.financial)' })
  overview(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('overview', q, u); }

  @Get('insights') @RequirePermissions(PERMISSIONS.ANALYTICS_DASHBOARD) @ApiOperation({ summary: 'Period-over-period observations, each traceable to the detailed reports' })
  insights(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('insights', q, u); }

  @Get('sales') @RequirePermissions(PERMISSIONS.ANALYTICS_INVOICES, PERMISSIONS.ANALYTICS_FINANCIAL) @ApiOperation({ summary: 'Invoiced sales: trends, customer / product / model breakdowns, status distribution' })
  sales(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('sales', q, u); }

  @Get('customers') @RequirePermissions(PERMISSIONS.ANALYTICS_CUSTOMERS) @ApiOperation({ summary: 'Customer counts, activity and top customers' })
  customers(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('customers', q, u); }

  @Get('vendors') @RequirePermissions(PERMISSIONS.ANALYTICS_VENDORS) @ApiOperation({ summary: 'Vendor master and relationships (no purchase data exists)' })
  vendors(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('vendors', q, u); }

  @Get('products') @RequirePermissions(PERMISSIONS.ANALYTICS_PRODUCTS) @ApiOperation({ summary: 'Catalogue, vendor availability, most quoted and most invoiced products' })
  products(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('products', q, u); }

  @Get('enquiries') @RequirePermissions(PERMISSIONS.ANALYTICS_ENQUIRIES) @ApiOperation({ summary: 'Enquiry status, source, priority, employee performance and conversion' })
  enquiries(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('enquiries', q, u); }

  @Get('quotations') @RequirePermissions(PERMISSIONS.ANALYTICS_QUOTATIONS) @ApiOperation({ summary: 'Quotations (each counted once, current revision)' })
  quotations(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('quotations', q, u); }

  @Get('proforma') @RequirePermissions(PERMISSIONS.ANALYTICS_PROFORMA) @ApiOperation({ summary: 'Proforma invoices and conversion to final invoices' })
  proforma(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('proforma', q, u); }

  @Get('invoices') @RequirePermissions(PERMISSIONS.ANALYTICS_INVOICES, PERMISSIONS.ANALYTICS_FINANCIAL) @ApiOperation({ summary: 'Final invoices, payment position, ageing and outstanding' })
  invoices(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('invoices', q, u); }

  @Get('payments') @RequirePermissions(PERMISSIONS.ANALYTICS_PAYMENTS, PERMISSIONS.ANALYTICS_FINANCIAL) @ApiOperation({ summary: 'Collections (verified payments only), methods, pending / rejected / reversed' })
  payments(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('payments', q, u); }

  @Get('deliveries') @RequirePermissions(PERMISSIONS.ANALYTICS_DELIVERIES) @ApiOperation({ summary: 'Deliveries: status, trends, dispatched vs confirmed quantities, delays' })
  deliveries(@Query() q: AnalyticsQueryDto, @CurrentUser() u: AuthenticatedUser) { return this.run('deliveries', q, u); }

  @Get('export')
  @RequirePermissions(PERMISSIONS.ANALYTICS_EXPORT)
  @ApiOperation({ summary: 'Export a report (same figures as on screen) as Excel, CSV or PDF; also needs that report’s own permission' })
  async export(@Query() q: ExportQueryDto, @CurrentUser() user: AuthenticatedUser, @Res() response: Response): Promise<void> {
    const data = await this.run(q.report, q, user);
    const f = this.filters(q);
    const company = ((await this.settings.get<PdfCompanyProfile | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE)) ?? {}) as PdfCompanyProfile;
    const filters = [q.customerId && `customer ${q.customerId}`, q.productId && `product ${q.productId}`, q.assignedToId && `employee ${q.assignedToId}`, q.buckets?.length && `ageing buckets ${q.buckets.join(',')}`].filter((x): x is string => Boolean(x));
    const meta = { title: TITLES[q.report], period: f.period.label, filters, generatedAt: new Date(), company };
    const tables = reportTables(data);
    const base = `${q.report}-${f.period.label.replace(/[^0-9a-z]+/gi, '_')}`;
    if (q.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      response.send(toCsvExport(meta, tables));
      return;
    }
    if (q.format === 'pdf') {
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
