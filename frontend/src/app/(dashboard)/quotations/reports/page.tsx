import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { QuotationReports } from '@/lib/types';
import { formatAmount, QUOTATION_STATUS_LABELS } from '@/lib/quotation-labels';
import { ErrorState, PageHeader } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { QuotationStatusBadge } from '@/components/quotation-badges';
import { IconChevronLeft } from '@/components/icons';

export const metadata: Metadata = { title: 'Quotation Reports' };

/** One figure per currency; amounts in different currencies are never added. */
function formatTotals(totals: Array<{ currency: string; total: string }>) {
  if (totals.length === 0) return '—';
  return totals.map((t) => `${t.currency} ${formatAmount(t.total)}`).join(' · ');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Horizontal bar scaled to the largest value in its table. */
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full min-w-[80px] rounded-full bg-surface-muted" aria-hidden>
      <div className="h-2 rounded-full bg-accent" style={{ width: `${width}%` }} />
    </div>
  );
}

export default async function QuotationReportsPage({ searchParams }: { searchParams: Promise<{ dateFrom?: string; dateTo?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('quotation.reports')) redirect('/quotations');

  const dateFrom = params.dateFrom && DATE.test(params.dateFrom) ? params.dateFrom : undefined;
  const dateTo = params.dateTo && DATE.test(params.dateTo) ? params.dateTo : undefined;

  let report: QuotationReports;
  try {
    report = await apiFetch<QuotationReports>(`/quotations/reports${queryString({ dateFrom, dateTo })}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <div className="space-y-5">
        <PageHeader title="Quotation Reports" />
        <ErrorState title="Could not load the reports" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </div>
    );
  }

  const period = dateFrom || dateTo ? `Quotations created ${dateFrom ? `from ${dateFrom}` : ''}${dateFrom && dateTo ? ' ' : ''}${dateTo ? `to ${dateTo}` : ''}` : 'All quotations';
  const maxStatus = Math.max(0, ...report.byStatus.map((r) => r.count));
  const maxCustomer = Math.max(0, ...report.byCustomer.map((r) => r.count));
  const maxEmployee = Math.max(0, ...report.byEmployee.map((r) => r.count));
  const { accepted, rejected, acceptanceRate } = report.acceptedVsRejected;
  const decided = accepted + rejected;

  return (
    <div className="space-y-5">
      <Link href="/quotations" className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> All quotations</Link>
      <PageHeader title="Quotation Reports" description={`${period}. Totals add each quotation's current grand total, shown separately per currency.`} />

      <form method="get" className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label htmlFor="r-from" className="field-label">Created from</label>
          <input id="r-from" name="dateFrom" type="date" defaultValue={dateFrom} className="field-input h-10 w-auto" />
        </div>
        <div>
          <label htmlFor="r-to" className="field-label">to</label>
          <input id="r-to" name="dateTo" type="date" defaultValue={dateTo} className="field-input h-10 w-auto" />
        </div>
        <button type="submit" className="btn-primary h-10">Apply</button>
        {(dateFrom || dateTo) && <Link href="/quotations/reports" className="btn-secondary h-10">Clear</Link>}
      </form>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Accepted vs rejected</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{acceptanceRate === null ? '—' : `${acceptanceRate}%`}</p>
          <p className="text-sm text-ink-muted">
            {decided === 0 ? 'No quotation has been accepted or rejected yet.' : `${accepted} accepted, ${rejected} rejected (acceptance rate of decided quotations)`}
          </p>
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Enquiry to quotation conversion</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{report.conversion.rate === null ? '—' : `${report.conversion.rate}%`}</p>
          <p className="text-sm text-ink-muted">
            {report.conversion.enquiries === 0 ? 'No enquiries in this period.' : `${report.conversion.converted} of ${report.conversion.enquiries} enquiries converted`}
          </p>
        </section>
        <section className="card p-5">
          <h2 className="text-base font-semibold text-ink">Revisions</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{report.revisions.average === null ? '—' : report.revisions.average.toFixed(1)}</p>
          <p className="text-sm text-ink-muted">
            {report.revisions.quotations === 0 ? 'No quotations in this period.' : `Average revisions per quotation over ${report.revisions.quotations} quotation(s); most revised: ${report.revisions.max ?? 0}`}
          </p>
        </section>
      </div>

      <section className="card">
        <PanelHeader title="By status" description="Count and total of quotations in each current status." />
        {report.byStatus.length === 0 ? (
          <EmptyStateClient title="No quotations" description="There are no quotations in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Quotations</th>
                  <th scope="col" className="w-1/3"><span className="sr-only">Share</span></th>
                  <th scope="col" className="text-right">Total value</th>
                </tr>
              </thead>
              <tbody>
                {[...report.byStatus].sort((a, b) => b.count - a.count).map((r) => (
                  <tr key={r.status}>
                    <td><Link href={`/quotations?status=${r.status}`} className="link-pill" aria-label={`${QUOTATION_STATUS_LABELS[r.status]} quotations`}><QuotationStatusBadge status={r.status} /></Link></td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td><Bar value={r.count} max={maxStatus} /></td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatTotals(r.totals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="card">
          <PanelHeader title="By customer" description="Top 20 customers by quotation value." />
          {report.byCustomer.length === 0 ? (
            <EmptyStateClient title="No quotations" description="There are no quotations in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col" className="text-right">Quotations</th>
                    <th scope="col"><span className="sr-only">Share</span></th>
                    <th scope="col" className="text-right">Total value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCustomer.map((r, index) => (
                    <tr key={r.customer?.id ?? `unknown-${index}`}>
                      <td className="min-w-[160px]">
                        {r.customer ? (
                          <Link href={`/quotations?customerId=${r.customer.id}`} className="link-pill font-semibold">{r.customer.name}</Link>
                        ) : (
                          <span className="text-ink-subtle">Unknown customer</span>
                        )}
                        {r.customer && <p className="font-mono text-xs text-ink-subtle">{r.customer.customerCode}</p>}
                      </td>
                      <td className="text-right tabular-nums">{r.count}</td>
                      <td><Bar value={r.count} max={maxCustomer} /></td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatTotals(r.totals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <PanelHeader title="By employee" description="Top 20 assigned employees by number of quotations." />
          {report.byEmployee.length === 0 ? (
            <EmptyStateClient title="No quotations" description="There are no quotations in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col" className="text-right">Quotations</th>
                    <th scope="col"><span className="sr-only">Share</span></th>
                    <th scope="col" className="text-right">Total value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byEmployee.map((r, index) => (
                    <tr key={r.employee?.id ?? `unassigned-${index}`}>
                      <td>
                        {r.employee ? (
                          <Link href={`/quotations?assignedToId=${r.employee.id}`} className="link-pill">{r.employee.fullName}</Link>
                        ) : (
                          <span className="text-ink-subtle">Unassigned</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{r.count}</td>
                      <td><Bar value={r.count} max={maxEmployee} /></td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatTotals(r.totals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
