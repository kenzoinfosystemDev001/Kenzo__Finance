import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, DeliveryListItem, DeliveryReports } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/vendor-labels';
import { ErrorState } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { DeliveryTable } from '@/components/delivery-table';
import { IconChevronLeft } from '@/components/icons';
import { DeliveryReportFilters } from './report-filters';

export const metadata: Metadata = { title: 'Delivery Reports' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
};

export default async function DeliveryReportsPage({ searchParams }: { searchParams: Promise<{ dateFrom?: string; dateTo?: string; customerId?: string; transporter?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  if (!can('delivery.reports')) return <ErrorState title="Not allowed" message="You do not have permission to view delivery reports." />;

  const filters = {
    dateFrom: params.dateFrom && DATE.test(params.dateFrom) ? params.dateFrom : undefined,
    dateTo: params.dateTo && DATE.test(params.dateTo) ? params.dateTo : undefined,
    customerId: params.customerId && UUID.test(params.customerId) ? params.customerId : undefined,
    transporter: params.transporter?.trim().slice(0, 200) || undefined,
  };

  let report: DeliveryReports;
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null;
  try {
    [report, customer] = await Promise.all([
      apiFetch<DeliveryReports>(`/deliveries/reports${queryString(filters)}`),
      // Only to label the customer filter.
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load delivery reports" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />;
  }

  const period = filters.dateFrom || filters.dateTo ? `${filters.dateFrom ? formatDate(filters.dateFrom) : 'the start'} to ${filters.dateTo ? formatDate(filters.dateTo) : 'today'}` : 'All dates';
  const lists: Array<[string, string, DeliveryListItem[]]> = [
    ['Delayed', 'Expected date passed and not delivered (all dates).', report.delayed],
    ['Scheduled / ready for dispatch', 'Waiting to leave.', report.scheduled],
    ['In transit', 'Dispatched or in transit; not yet confirmed.', report.inTransit],
    ['Failed', 'Last attempt failed; reschedule or mark returned.', report.failed],
    ['Partially delivered', 'Confirmed with less received than dispatched.', report.partial],
    ['Delivered', 'Fully received.', report.delivered],
  ];

  return (
    <div className="space-y-5">
      <Link href="/deliveries" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> Delivery register</Link>
      <div>
        <h1 className="text-xl font-bold text-ink">Delivery Reports</h1>
        <p className="text-sm text-ink-muted">
          {period}{customer ? ` for ${customer.name}` : ''}{filters.transporter ? `, transporter “${filters.transporter}”` : ''}. From the database; generated {formatDateTime(report.generatedAt)}.
        </p>
      </div>
      <DeliveryReportFilters customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ReportTable title="Daily dispatch" description="By dispatch date (latest first)." headers={['Date', 'Deliveries', 'Quantity']} rows={report.dailyDispatch.map((r) => [formatDate(r.date), r.deliveries, r.quantity])} numeric={[1, 2]} />
        <ReportTable title="Monthly" description="By delivery date." headers={['Month', 'Deliveries', 'Fully delivered']} rows={report.monthly.map((r) => [monthLabel(r.month), r.deliveries, r.delivered])} numeric={[1, 2]} />
        <ReportTable
          title="By customer"
          description="Most deliveries first (top 200)."
          headers={['Customer', 'Deliveries', 'Fully delivered']}
          rows={report.byCustomer.map((r) => [can('customer.read') ? <Link key={r.customer.id} href={`/customers/${r.customer.id}`} className="hover:text-accent hover:underline">{r.customer.name}</Link> : r.customer.name, r.deliveries, r.delivered])}
          numeric={[1, 2]}
        />
        <ReportTable
          title="By transporter / courier"
          description="Excludes drafts and cancelled deliveries."
          headers={['Transporter', 'Deliveries', 'Fully delivered', 'Failed']}
          rows={report.byTransporter.map((r) => [r.transporter, r.deliveries, r.delivered, r.failed])}
          numeric={[1, 2, 3]}
        />
      </div>
      <ReportTable
        title="By invoice"
        description="Dispatched quantity counts goods that left; delivered counts confirmed receipts only."
        headers={['Invoice', 'Deliveries', 'Dispatched qty', 'Delivered qty']}
        rows={report.byInvoice.map((r) => [
          can('invoice.read') ? <Link key={r.invoice.id} href={`/final-invoices/${r.invoice.id}`} className="font-mono hover:text-accent hover:underline">{r.invoice.invoiceNumber ?? 'draft'}</Link> : <span className="font-mono">{r.invoice.invoiceNumber}</span>,
          r.deliveries,
          r.dispatchedQuantity,
          r.deliveredQuantity,
        ])}
        numeric={[1, 2, 3]}
      />

      {lists.map(([title, description, rows]) => (
        <section key={title} className="card overflow-hidden">
          <PanelHeader title={`${title} (${rows.length}${rows.length === 300 ? '+' : ''})`} description={description} />
          {rows.length === 0 ? (
            <EmptyStateClient title="None" description="No deliveries match." />
          ) : (
            <DeliveryTable deliveries={rows} canReadCustomers={can('customer.read')} canReadInvoices={can('invoice.read')} />
          )}
        </section>
      ))}
    </div>
  );
}

function ReportTable({ title, description, headers, rows, numeric = [] }: { title: string; description?: string; headers: string[]; rows: Array<Array<React.ReactNode>>; numeric?: number[] }) {
  return (
    <section className="card overflow-hidden">
      <PanelHeader title={title} description={description} />
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">No records.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="data-table">
            <thead>
              <tr>{headers.map((h, i) => <th key={h} scope="col" className={numeric.includes(i) ? 'text-right' : undefined}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{row.map((v, c) => <td key={c} className={numeric.includes(c) ? 'text-right tabular-nums' : undefined}>{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
