import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { ErrorState } from '@/components/ui';

export const metadata: Metadata = { title: 'Payment Reports' };

export default async function PaymentReportsPage({ searchParams }: { searchParams: Promise<{ dateFrom?: string; dateTo?: string; customerId?: string; method?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user?.permissions.includes('payment.reports')) return <ErrorState title="Not allowed" message="You do not have permission to view payment reports." />;
  let reports: any;
  try {
    reports = await apiFetch<any>(`/payments/reports${queryString(params)}`);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load reports" message={apiError?.messages[0] ?? 'The server could not be reached.'} />;
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-ink">Payment Reports</h1><p className="text-sm text-ink-muted">Database-driven payment and outstanding balances.</p></div><Link href="/payments" className="btn-secondary">Payment Register</Link></div>
      <form className="card grid gap-3 p-4 md:grid-cols-5"><label className="text-sm">From<input name="dateFrom" type="date" defaultValue={params.dateFrom} className="form-input mt-1 w-full" /></label><label className="text-sm">To<input name="dateTo" type="date" defaultValue={params.dateTo} className="form-input mt-1 w-full" /></label><label className="text-sm">Customer ID<input name="customerId" defaultValue={params.customerId} className="form-input mt-1 w-full" /></label><label className="text-sm">Method<input name="method" defaultValue={params.method} className="form-input mt-1 w-full" /></label><button className="btn-secondary self-end" type="submit">Filter</button></form>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportTable title="Daily Payments" headers={['Date','Currency','Count','Total']} rows={reports.daily.map((r: any) => [r.key,r.currency,r.count,formatMoney(r.total,r.currency)])}/>
        <ReportTable title="Monthly Payments" headers={['Month','Currency','Count','Total']} rows={reports.monthly.map((r: any) => [r.key,r.currency,r.count,formatMoney(r.total,r.currency)])}/>
        <ReportTable title="Payment Methods" headers={['Method','Currency','Count','Total']} rows={reports.byMethod.map((r: any) => [r.label,r.currency,r.count,formatMoney(r.total,r.currency)])}/>
        <ReportTable title="Pending Verification" headers={['Receipt','Customer','Amount','Date']} rows={reports.pendingVerification.map((r: any) => [r.receiptNumber,r.customer.name,formatMoney(r.amount,r.currency),formatDate(r.paymentDate)])}/>
      </div>
      <ReportTable title="Outstanding Invoices" headers={['Invoice','Customer','Currency','Outstanding','Due']} rows={reports.outstandingInvoices.map((r: any) => [r.invoiceNumber,r.customer.name,r.currency,formatMoney(r.outstanding,r.currency),r.dueDate?formatDate(r.dueDate):'—'])}/>
      <ReportTable title="Overdue Invoices" headers={['Invoice','Customer','Currency','Outstanding','Due']} rows={reports.overdueInvoices.map((r: any) => [r.invoiceNumber,r.customer.name,r.currency,formatMoney(r.outstanding,r.currency),r.dueDate?formatDate(r.dueDate):'—'])}/>
    </div>
  );
}

function ReportTable({title,headers,rows}:{title:string;headers:string[];rows:Array<Array<string|number>>}) {
  return <section className="card overflow-hidden"><h2 className="border-b border-border px-5 py-3 font-semibold text-ink">{title}</h2>{rows.length===0?<p className="p-5 text-sm text-ink-muted">No records.</p>:<div className="overflow-x-auto"><table className="data-table"><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((value,columnIndex)=><td key={columnIndex}>{value}</td>)}</tr>)}</tbody></table></div>}</section>;
}
