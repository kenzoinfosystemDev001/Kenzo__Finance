import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaginatedResponse, PaymentListItem, PaymentSummary } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { IconDownload, IconPlus, IconWallet } from '@/components/icons';

export const metadata: Metadata = { title: 'Payments' };

const STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVERSED'] as const;

function StatusBadge({ status }: { status: string }) {
  const style = status === 'VERIFIED'
    ? 'border-success/30 bg-success-subtle text-success'
    : status === 'PENDING_VERIFICATION'
      ? 'border-warning/30 bg-warning-subtle text-warning'
      : 'border-danger/30 bg-danger-subtle text-danger';
  return <span className={clsx('chip', style)}>{status.replace(/_/g, ' ')}</span>;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  if (!can('payment.read')) return <ErrorState title="Not allowed" message="You do not have permission to view payments." />;

  let data: PaginatedResponse<PaymentListItem>;
  let summary: PaymentSummary | null = null;
  try {
    [data, summary] = await Promise.all([
      apiFetch<PaginatedResponse<PaymentListItem>>(`/payments${queryString({
        search: params.search,
        status: params.status,
        customerId: params.customerId,
        finalInvoiceId: params.finalInvoiceId,
        method: params.method,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        amountMin: params.amountMin,
        amountMax: params.amountMax,
        sortBy: params.sortBy ?? 'createdAt',
        sortDir: params.sortDir ?? 'desc',
        page: params.page ?? '1',
        pageSize: params.pageSize ?? '25',
      })}`),
      apiFetch<PaymentSummary>('/payments/summary').catch(() => null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load payments" message={apiError?.messages[0] ?? 'The server could not be reached.'} />;
  }

  const first = summary?.totalReceived.map((v) => `${v.currency} ${formatMoney(v.total, v.currency)} (${v.count})`).join(' · ');
  const outstanding = summary?.outstanding.map((v) => `${v.currency} ${formatMoney(v.total, v.currency)} (${v.invoices} invoices)`).join(' · ');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Payment Management</h1>
          <p className="text-sm text-ink-muted">Record, verify and track customer payments.</p>
        </div>
        <div className="flex gap-2">
          {can('payment.reports') && <Link href="/payments/reports" className="btn-secondary">Reports</Link>}
          {can('payment.create') && <Link href="/payments/new" className="btn-primary"><IconPlus size={16} /> Record Payment</Link>}
        </div>
      </div>

      {summary && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Received" value={first ?? '0'} icon={<IconWallet size={22} />} iconClassName="bg-success" />
          <StatCard label="Received Today" value={summary.receivedToday.map((v) => `${v.currency} ${formatMoney(v.total, v.currency)}`).join(' · ') || '0'} icon={<IconWallet size={22} />} iconClassName="bg-accent" />
          <StatCard label="This Month" value={summary.receivedThisMonth.map((v) => `${v.currency} ${formatMoney(v.total, v.currency)}`).join(' · ') || '0'} icon={<IconWallet size={22} />} iconClassName="bg-cyan-500" />
          <StatCard label="Pending Verification" value={summary.pendingVerification.reduce((n, v) => n + v.count, 0)} icon={<IconWallet size={22} />} iconClassName="bg-warning" href="/payments?status=PENDING_VERIFICATION" />
          <StatCard label="Outstanding" value={outstanding || '0'} icon={<IconWallet size={22} />} iconClassName="bg-orange-500" />
          <StatCard label="Partially Paid" value={summary.partiallyPaidInvoices} icon={<IconWallet size={22} />} iconClassName="bg-blue-500" />
          <StatCard label="Fully Paid" value={summary.fullyPaidInvoices} icon={<IconWallet size={22} />} iconClassName="bg-success" />
          <StatCard label="Overdue" value={summary.overdueInvoices} icon={<IconWallet size={22} />} iconClassName="bg-danger" />
        </section>
      )}

      <form className="card grid gap-3 p-4 md:grid-cols-6">
        <label className="md:col-span-2 text-sm">Search<input name="search" defaultValue={params.search} className="form-input mt-1 w-full" placeholder="Receipt, invoice or customer" /></label>
        <label className="text-sm">Status<select name="status" defaultValue={params.status ?? ''} className="form-input mt-1 w-full"><option value="">All</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></label>
        <label className="text-sm">From<input name="dateFrom" type="date" defaultValue={params.dateFrom} className="form-input mt-1 w-full" /></label>
        <label className="text-sm">To<input name="dateTo" type="date" defaultValue={params.dateTo} className="form-input mt-1 w-full" /></label>
        <button className="btn-secondary self-end" type="submit">Filter</button>
      </form>

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState title="No payments" description="Record a payment against an issued final invoice." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Invoice</th><th className="text-right">Amount</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>{data.items.map((payment) => (
                <tr key={payment.id}>
                  <td><Link href={`/payments/${payment.id}`} className="font-mono font-semibold text-accent hover:underline">{payment.receiptNumber}</Link></td>
                  <td>{formatDate(payment.paymentDate)}</td>
                  <td>{can('customer.read') ? <Link href={`/customers/${payment.customer.id}`} className="hover:text-accent hover:underline">{payment.customer.name}</Link> : payment.customer.name}</td>
                  <td>{payment.allocations.map((allocation) => can('invoice.read') ? <Link key={allocation.finalInvoice.id} href={`/final-invoices/${allocation.finalInvoice.id}`} className="font-mono hover:text-accent hover:underline">{allocation.finalInvoice.invoiceNumber}</Link> : allocation.finalInvoice.invoiceNumber).join(', ')}</td>
                  <td className="text-right font-semibold tabular-nums">{formatMoney(payment.amount, payment.currency)}</td>
                  <td>{payment.method.replace(/_/g, ' ')}</td>
                  <td><StatusBadge status={payment.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {can('payment.export') && data.meta.totalItems > 0 && (
        <a className="btn-secondary inline-flex" href={`/payments/export${queryString({ search: params.search, status: params.status, customerId: params.customerId, finalInvoiceId: params.finalInvoiceId, method: params.method, dateFrom: params.dateFrom, dateTo: params.dateTo, amountMin: params.amountMin, amountMax: params.amountMax, sortBy: params.sortBy, sortDir: params.sortDir })}`}><IconDownload size={16} /> Export CSV</a>
      )}
      <Pagination meta={data.meta} basePath="/payments" params={{ search: params.search, status: params.status, dateFrom: params.dateFrom, dateTo: params.dateTo }} />
    </div>
  );
}
