import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, FinalInvoiceListItem, FinalInvoiceSummary, PaginatedResponse, ProformaDetail } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { FINAL_INVOICE_STATUSES } from '@/lib/final-invoice-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { DraftNumberPill, FinalInvoiceStatusBadge } from '@/components/final-invoice-badges';
import { IconAlert, IconArrowDown, IconArrowRight, IconArrowUp, IconChart, IconCheckCircle, IconClock, IconDownload, IconFile, IconPencil, IconPlus, IconSort, IconX } from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { FinalInvoiceToolbar } from './final-invoice-toolbar';

export const metadata: Metadata = { title: 'Final Invoices' };

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const SORT_FIELDS = ['invoiceNumber', 'invoiceDate', 'dueDate', 'grandTotal', 'status', 'createdAt'];

type Params = Record<
  | 'search' | 'status' | 'customerId' | 'assignedToId' | 'proformaInvoiceId' | 'dateFrom' | 'dateTo' | 'dueFrom' | 'dueTo' | 'pastDueOnly'
  | 'amountMin' | 'amountMax' | 'sortBy' | 'sortDir' | 'page' | 'pageSize',
  string | undefined
>;

export default async function FinalInvoicesPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  if (!can('invoice.read')) {
    return (
      <>
        <InvoiceHeader canCreate={false} canReports={false} />
        <ErrorState title="Not allowed" message="You do not have permission to view invoices." />
      </>
    );
  }

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy && SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const statuses = (params.status ?? '').split(',').filter((s) => (FINAL_INVOICE_STATUSES as string[]).includes(s));
  const uuid = (value?: string) => (value && UUID.test(value) ? value : undefined);
  const date = (value?: string) => (value && DATE.test(value) ? value : undefined);
  const amount = (value?: string) => (value && MONEY.test(value) ? value : undefined);
  const filters = {
    search: params.search?.trim() || undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    customerId: uuid(params.customerId),
    assignedToId: uuid(params.assignedToId),
    proformaInvoiceId: uuid(params.proformaInvoiceId),
    dateFrom: date(params.dateFrom),
    dateTo: date(params.dateTo),
    dueFrom: date(params.dueFrom),
    dueTo: date(params.dueTo),
    pastDueOnly: params.pastDueOnly === 'true' ? 'true' : undefined,
    amountMin: amount(params.amountMin),
    amountMax: amount(params.amountMax),
  };

  let data: PaginatedResponse<FinalInvoiceListItem>;
  let summary: FinalInvoiceSummary | null;
  let assignees: EnquiryAssignee[];
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null;
  let proforma: Pick<ProformaDetail, 'piNumber'> | null;
  try {
    [data, summary, assignees, customer, proforma] = await Promise.all([
      apiFetch<PaginatedResponse<FinalInvoiceListItem>>(`/final-invoices${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<FinalInvoiceSummary>('/final-invoices/summary').catch(() => null),
      apiFetch<EnquiryAssignee[]>('/final-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
      filters.proformaInvoiceId && can('proforma.read') ? apiFetch<ProformaDetail>(`/proforma-invoices/${filters.proformaInvoiceId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <InvoiceHeader canCreate={false} canReports={false} />
        <ErrorState title="Could not load invoices" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('invoice.export') && data.meta.totalItems > 0 ? `/final-invoices/export${queryString({ ...filters, sortBy, sortDir })}` : null;
  const sortHref = (field: string) =>
    `/final-invoices${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;
  const SortHeader = ({ field, label, right = false }: { field: string; label: string; right?: boolean }) => {
    const active = sortBy === field;
    return (
      <th scope="col" className={right ? 'text-right' : undefined} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={sortHref(field)} scroll={false} className={clsx('inline-flex items-center gap-1 whitespace-nowrap hover:text-ink', active && 'text-accent')}>
          {label}
          {active ? (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconSort size={12} className="opacity-40" />}
        </Link>
      </th>
    );
  };
  const firstRow = (data.meta.page - 1) * data.meta.pageSize;
  const invoicedValue = summary?.invoicedValue.map((v) => formatMoney(v.total, v.currency)).join(' · ');

  return (
    <div className="space-y-5">
      <InvoiceHeader canCreate={can('invoice.create')} canReports={can('invoice.reports')} />

      {summary && (
        <section aria-label="Invoice summary" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Total Invoices" value={summary.total} icon={<IconFile size={22} />} iconClassName="bg-accent" href="/final-invoices" />
          <StatCard label="Draft" value={summary.draft} icon={<IconPencil size={22} />} iconClassName="bg-ink-subtle" href="/final-invoices?status=DRAFT" />
          <StatCard
            label="Pending Approval"
            value={summary.pendingApproval}
            icon={<IconClock size={22} />}
            iconClassName="bg-warning"
            href="/final-invoices?status=PENDING_APPROVAL"
            note={summary.approvalRequired ? `${summary.approved} approved, not issued` : 'Approval is switched off'}
          />
          <StatCard
            label="Issued"
            value={summary.issued}
            icon={<IconCheckCircle size={22} />}
            iconClassName="bg-accent"
            href="/final-invoices?status=ISSUED"
            note={invoicedValue ? `Invoiced value ${invoicedValue}` : undefined}
          />
          <StatCard label="Sent" value={summary.sent} icon={<IconArrowRight size={22} />} iconClassName="bg-success" href="/final-invoices?status=SENT" />
          <StatCard label="Past Due Date" value={summary.pastDue} icon={<IconAlert size={22} />} iconClassName="bg-danger" href="/final-invoices?pastDueOnly=true" note="Issued or sent, due date passed" />
          <StatCard label="Cancelled" value={summary.cancelled} icon={<IconX size={22} />} iconClassName="bg-danger" href="/final-invoices?status=CANCELLED" />
        </section>
      )}
      {summary && invoicedValue && (
        <p className="text-sm text-ink-muted">Invoiced value (issued and sent invoices, per currency, never added across currencies): {invoicedValue}.</p>
      )}
      {summary && !summary.paymentTrackingAvailable && (
        <p className="text-sm text-ink-muted">
          Payment figures (paid, partially paid, received and outstanding) will appear once Payment Management is in use. Until then no payment figures are shown.
        </p>
      )}

      <FinalInvoiceToolbar
        assignees={assignees}
        customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null}
        proformaLabel={filters.proformaInvoiceId ? proforma?.piNumber ?? 'selected' : null}
        exportHref={exportHref}
      />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
            description={hasFilters ? 'Try another invoice number, PI number, customer or product, or clear the filters.' : 'A final invoice is raised from an issued proforma invoice.'}
            action={
              hasFilters ? (
                <Link href="/final-invoices" className="btn-secondary">Clear filters</Link>
              ) : (
                can('invoice.create') && <Link href="/final-invoices/new" className="btn-primary"><IconPlus size={16} /> New Final Invoice</Link>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-10">#</th>
                    <SortHeader field="invoiceNumber" label="Invoice No." />
                    <SortHeader field="invoiceDate" label="Invoice Date" />
                    <th scope="col">Customer</th>
                    <th scope="col">Proforma Inv.</th>
                    <SortHeader field="grandTotal" label="Total" right />
                    <SortHeader field="dueDate" label="Due Date" />
                    <th scope="col">Assigned To</th>
                    <SortHeader field="status" label="Status" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((inv, index) => {
                    const ref = inv.invoiceNumber ?? 'draft invoice';
                    return (
                      <tr key={inv.id}>
                        <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                        <td className="whitespace-nowrap">
                          <Link href={`/final-invoices/${inv.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">
                            {inv.invoiceNumber ?? <DraftNumberPill />}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                        <td className="min-w-[180px]">
                          <span className="font-semibold text-ink">{inv.customer.name}</span>
                          <p className="font-mono text-xs text-ink-subtle">{inv.customer.customerCode}</p>
                        </td>
                        <td className="whitespace-nowrap">
                          {can('proforma.read') ? (
                            <Link href={`/proforma-invoices/${inv.proformaInvoice.id}`} className="font-mono text-sm hover:text-accent hover:underline">{inv.proformaInvoice.piNumber}</Link>
                          ) : (
                            <span className="font-mono text-sm">{inv.proformaInvoice.piNumber}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.grandTotal, inv.currency)}</td>
                        <td className={clsx('whitespace-nowrap', inv.pastDue && 'font-semibold text-danger')}>
                          {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-ink-subtle">&mdash;</span>}
                          {inv.pastDue && <p className="text-xs font-normal">Past due date</p>}
                        </td>
                        <td className="whitespace-nowrap">{inv.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                        <td><FinalInvoiceStatusBadge status={inv.status} /></td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Link href={`/final-invoices/${inv.id}`} className="btn-secondary h-8 px-2.5 text-sm">View</Link>
                            {can('invoice.update') && inv.status === 'DRAFT' && (
                              <Link href={`/final-invoices/${inv.id}/edit`} className="btn-secondary h-8 px-2.5 text-sm" aria-label={`Edit ${ref}`}><IconPencil size={15} /></Link>
                            )}
                            {can('invoice.download') && (
                              <a href={`/final-invoices/${inv.id}/pdf`} className="btn-secondary h-8 px-2.5 text-sm" aria-label={`Download PDF of ${ref}`}><IconDownload size={15} /></a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/final-invoices"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="invoices"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceHeader({ canCreate, canReports }: { canCreate: boolean; canReports: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent"><IconFile size={26} /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Final Invoices</h1>
          <p className="text-base text-ink-muted">Raise, issue and track customer invoices from issued proforma invoices.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canReports && <Link href="/final-invoices/reports" className="btn-secondary h-11 px-4"><IconChart size={16} /> Reports</Link>}
        {canCreate && <Link href="/final-invoices/new" className="btn-primary h-11 px-5 text-base"><IconPlus size={18} /> New Final Invoice</Link>}
      </div>
    </div>
  );
}
