import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth-actions';
import { canViewReport, count, filterSearch, money, parseFilters, percent, REPORT_TITLES, SECTION_REPORTS, type InsightsReport, type OverviewReport, type SectionReport } from '@/lib/analytics';
import { ErrorState } from '@/components/ui';
import { DefinitionsPanel, LoadError, loadReport, MoneyTile, Notice, ReportShell, Restricted, Section, Tile } from './_components/report-ui';

export const metadata: Metadata = { title: 'Reports & Analytics' };

export default async function ReportsOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const search = filterSearch(filters);
  const link = (r: SectionReport) => (canViewReport(r, permissions) ? `/reports/${r}${search}` : undefined);

  if (!canViewReport('overview', permissions)) {
    const available = SECTION_REPORTS.filter((r) => canViewReport(r, permissions));
    return (
      <ReportShell active="overview" permissions={permissions} filters={filters}>
        <ErrorState title="Not allowed" message="You do not have permission to view the executive analytics dashboard (analytics.dashboard)." />
        {available.length > 0 && (
          <p className="text-sm text-ink-muted">
            Reports you can open:{' '}
            {available.map((r, i) => (
              <span key={r}>
                {i > 0 && ', '}
                <Link href={`/reports/${r}${search}`} className="text-accent hover:underline">{REPORT_TITLES[r]}</Link>
              </span>
            ))}
          </p>
        )}
      </ReportShell>
    );
  }

  const [overview, insights] = await Promise.all([loadReport<OverviewReport>('overview', filters), loadReport<InsightsReport>('insights', filters)]);
  const financialPermission = permissions.includes('analytics.financial');

  return (
    <ReportShell
      active="overview"
      permissions={permissions}
      filters={filters}
      period={overview.ok ? overview.data.period : undefined}
      description="Executive KPIs computed live from the business records. Money is shown per currency and never added across currencies."
    >
      {!overview.ok ? (
        <LoadError result={overview} what="the overview" />
      ) : (
        <OverviewBody data={overview.data} link={link} />
      )}

      <Section
        title="Executive summary"
        description={insights.ok && insights.data.comparison ? `Compared with the previous period of the same length: ${insights.data.comparison}.` : 'Period-over-period observations.'}
      >
        {!insights.ok ? (
          <LoadError result={insights} what="the summary" />
        ) : (
          <div className="space-y-3">
            {!financialPermission && <p className="text-sm text-ink-muted">Money comparisons are <Restricted inline /> (they need the analytics.financial permission).</p>}
            {insights.data.message && <p className="text-sm text-ink-muted">{insights.data.message}</p>}
            {insights.data.insights.length > 0 && (
              <ul className="divide-y divide-border">
                {insights.data.insights.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                    <span className="text-sm text-ink">{i.text}</span>
                    <InsightFigures insight={i} />
                  </li>
                ))}
              </ul>
            )}
            <DefinitionsPanel definitions={insights.data.definitions} />
          </div>
        )}
      </Section>
    </ReportShell>
  );
}

/** Current vs previous figures as returned by the API (insights, service.ts:647-680). */
function InsightFigures({ insight }: { insight: InsightsReport['insights'][number] }) {
  const currency = insight.key.includes(':') ? insight.key.split(':')[1] : null;
  const show = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return count(v);
    if (typeof v === 'string') return currency ? money(v, currency) : v;
    if (typeof v === 'object' && v && 'rate' in v) {
      const o = v as { rate: number | null; total: number; converted: number };
      return `${percent(o.rate)} (${o.converted}/${o.total})`;
    }
    return null;
  };
  const now = show(insight.current);
  const before = show(insight.previous);
  if (now === null) return null;
  return (
    <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
      <span className="font-semibold text-ink">{now}</span>
      {before !== null && <> vs {before}</>}
    </span>
  );
}

function OverviewBody({ data, link }: { data: OverviewReport; link: (r: SectionReport) => string | undefined }) {
  const c = data.counts;
  const f = data.financial;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="Customers" value={count(c.customers)} href={link('customers')} />
        <Tile label="Vendors" value={count(c.vendors)} href={link('vendors')} />
        <Tile label="Products" value={count(c.products)} href={link('products')} />
        <Tile label="Enquiries" value={count(c.enquiries)} href={link('enquiries')} />
        <Tile label="Quotations" value={count(c.quotations)} href={link('quotations')} />
        <Tile label="Proforma invoices" value={count(c.proformaInvoices)} href={link('proforma')} />
        <Tile label="Final invoices" value={count(c.finalInvoices)} href={link('invoices')} />
        <Tile label="Deliveries" value={count(c.deliveries)} note={`${count(c.completedDeliveries)} completed`} href={link('deliveries')} />
      </div>

      <Section title="Business performance" description="Each figure describes a different stage of the business and is never added to another.">
        {f === null ? (
          <p className="text-sm text-ink-muted">
            Money and delivery-quantity figures are <Restricted inline />: they need the analytics.financial permission.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MoneyTile label="Invoiced sales" items={f.invoicedValue} note={data.definitions.invoicedValue} href={link('sales')} />
              <MoneyTile label="Verified payments received" items={f.verifiedPayments} note={data.definitions.verifiedPayments} href={link('payments')} />
              <MoneyTile label="Outstanding receivables" items={f.outstandingReceivables} note={data.definitions.outstandingReceivables} href={link('invoices')} />
              <MoneyTile label="Quotation value" items={f.quotationValue} note={data.definitions.quotationValue} href={link('quotations')} />
              <MoneyTile label="Proforma invoice value" items={f.proformaValue} note={data.definitions.proformaValue} href={link('proforma')} />
              <Tile
                label="Delivery completion"
                value={percent(f.delivery.completionPercent)}
                note={`${count(f.delivery.deliveredQuantity)} delivered / ${count(f.delivery.dispatchedQuantity)} dispatched / ${count(f.delivery.invoicedQuantity)} invoiced (quantity)`}
                href={link('deliveries')}
              />
            </div>
            {data.definitions.separation && <Notice>{data.definitions.separation}</Notice>}
          </div>
        )}
      </Section>

      <DefinitionsPanel definitions={data.definitions} />
    </>
  );
}
