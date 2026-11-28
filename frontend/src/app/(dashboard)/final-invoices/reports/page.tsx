import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, FinalInvoiceReports } from '@/lib/types';
import { formatMoney, formatRate } from '@/lib/quotation-labels';
import { MONTH_NAMES } from '@/lib/final-invoice-labels';
import { formatDate } from '@/lib/vendor-labels';
import { ErrorState, PageHeader } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { FinalInvoiceStatusBadge } from '@/components/final-invoice-badges';
import { PaymentStateBadge } from '@/components/payment-badges';
import { IconChevronLeft, IconDownload } from '@/components/icons';
import { InvoiceReportFilters } from './report-filters';

export const metadata: Metadata = { title: 'Invoice Reports' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const monthLabel = (month: string) => {
  const [year, m] = month.split('-');
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${year}` : month;
};

export default async function InvoiceReportsPage({ searchParams }: { searchParams: Promise<{ dateFrom?: string; dateTo?: string; customerId?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  if (!can('invoice.reports')) {
    return (
      <div className="space-y-5">
        <PageHeader title="Invoice Reports" />
        <ErrorState title="Not allowed" message="You do not have permission to view invoice reports." />
      </div>
    );
  }

  const filters = {
    dateFrom: params.dateFrom && DATE.test(params.dateFrom) ? params.dateFrom : undefined,
    dateTo: params.dateTo && DATE.test(params.dateTo) ? params.dateTo : undefined,
    customerId: params.customerId && UUID.test(params.customerId) ? params.customerId : undefined,
  };

  let report: FinalInvoiceReports;
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null;
  try {
    [report, customer] = await Promise.all([
      apiFetch<FinalInvoiceReports>(`/final-invoices/reports${queryString(filters)}`),
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <div className="space-y-5">
        <PageHeader title="Invoice Reports" />
        <ErrorState title="Could not load the reports" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </div>
    );
  }

  const period =
    filters.dateFrom || filters.dateTo
      ? `Issued invoices dated ${filters.dateFrom ? `from ${formatDate(filters.dateFrom)}` : ''}${filters.dateFrom && filters.dateTo ? ' ' : ''}${filters.dateTo ? `to ${formatDate(filters.dateTo)}` : ''}`
      : 'All issued invoices';
  // The register export covers the same live (issued + sent) invoices and filters.
  const exportHref = `/final-invoices/export${queryString({ ...filters, status: 'ISSUED,SENT', sortBy: 'invoiceDate', sortDir: 'asc' })}`;

  return (
    <div className="space-y-5">
      <Link href="/final-invoices" className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> All invoices</Link>
      <PageHeader
        title="Invoice Reports"
        description={`${period}${customer ? ` for ${customer.name}` : ''}. Drafts and cancelled invoices are excluded; amounts are shown per currency and never added across currencies.`}
        actions={can('invoice.export') ? <a href={exportHref} className="btn-secondary"><IconDownload size={16} /> Export register</a> : undefined}
      />

      <InvoiceReportFilters customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null} />


      <section className="card">
        <PanelHeader title="By month" description="Invoices issued per month of invoice date." />
        {report.byMonth.length === 0 ? (
          <EmptyStateClient title="No issued invoices" description="Nothing matches the selected period and customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="text-right">Invoices</th>
                  <th scope="col" className="text-right">Taxable</th>
                  <th scope="col" className="text-right">Tax</th>
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.byMonth.map((r) => (
                  <tr key={`${r.month}-${r.currency}`}>
                    <td className="whitespace-nowrap">{monthLabel(r.month)}</td>
                    <td>{r.currency}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(r.taxable, r.currency)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(r.tax, r.currency)}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(r.total, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <PanelHeader title="By customer" description="Largest totals first (top 200)." />
        {report.byCustomer.length === 0 ? (
          <EmptyStateClient title="No issued invoices" description="Nothing matches the selected period and customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="text-right">Invoices</th>
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.byCustomer.map((r) => (
                  <tr key={`${r.customer.id}-${r.currency}`}>
                    <td className="min-w-[180px]">
                      {can('customer.read') ? (
                        <Link href={`/customers/${r.customer.id}`} className="link-pill font-semibold">{r.customer.name}</Link>
                      ) : (
                        <span className="font-semibold text-ink">{r.customer.name}</span>
                      )}
                      <p className="font-mono text-xs text-ink-subtle">{r.customer.customerCode}</p>
                    </td>
                    <td>{r.currency}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(r.total, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <PanelHeader title="Tax summary" description="Taxable value and tax per tax label and rate, from the invoice lines." />
        {report.taxSummary.length === 0 ? (
          <EmptyStateClient title="No taxed lines" description="No issued invoice line in this selection carries tax." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tax</th>
                  <th scope="col" className="text-right">Rate</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="text-right">Taxable</th>
                  <th scope="col" className="text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {report.taxSummary.map((r) => (
                  <tr key={`${r.label}-${r.rate}-${r.currency}`}>
                    <td>{r.label}</td>
                    <td className="text-right tabular-nums">{formatRate(r.rate)}%</td>
                    <td>{r.currency}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(r.taxable, r.currency)}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(r.tax, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <PanelHeader
          title="Overdue"
          description="Issued invoices past their due date and not fully paid. Oldest first, up to 200."
        />
        {report.pastDue.length === 0 ? (
          <EmptyStateClient title="Nothing overdue" description="No unpaid issued invoice has passed its due date." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Invoice No.</th>
                  <th scope="col">Invoice Date</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col" className="text-right">Total</th>
                  <th scope="col" className="text-right">Received</th>
                  <th scope="col" className="text-right">Outstanding</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.pastDue.map((inv) => (
                  <tr key={inv.id}>
                    <td className="whitespace-nowrap">
                      <Link href={`/final-invoices/${inv.id}`} className="link-pill font-mono text-sm font-semibold">{inv.invoiceNumber ?? 'Draft'}</Link>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                    <td className="whitespace-nowrap font-semibold text-danger">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                    <td className="min-w-[180px]">
                      <span className="font-semibold text-ink">{inv.customer.name}</span>
                      <p className="font-mono text-xs text-ink-subtle">{inv.customer.customerCode}</p>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.grandTotal, inv.currency)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.amountReceived, inv.currency)}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(inv.outstanding, inv.currency)}</td>
                    <td><FinalInvoiceStatusBadge status={inv.status} /> <PaymentStateBadge state={inv.paymentState} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
