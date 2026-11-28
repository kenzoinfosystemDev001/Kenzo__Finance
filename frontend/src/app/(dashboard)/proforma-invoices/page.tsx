import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, PaginatedResponse, ProformaListItem, ProformaSummary, QuotationDetail } from '@/lib/types';
import { formatMoney } from '@/lib/quotation-labels';
import { PROFORMA_STATUSES } from '@/lib/proforma-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { ProformaStatusBadge } from '@/components/proforma-badges';
import { IconArrowDown, IconArrowRight, IconArrowUp, IconCheckCircle, IconClock, IconDownload, IconInvoice, IconPencil, IconPlus, IconSort, IconX } from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { ProformaToolbar } from './proforma-toolbar';

export const metadata: Metadata = { title: 'Proforma Invoices' };

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const SORT_FIELDS = ['piNumber', 'piDate', 'grandTotal', 'status', 'createdAt', 'dueDate'];

type Params = Record<'search' | 'status' | 'customerId' | 'assignedToId' | 'quotationId' | 'dateFrom' | 'dateTo' | 'amountMin' | 'amountMax' | 'sortBy' | 'sortDir' | 'page' | 'pageSize', string | undefined>;

export default async function ProformaInvoicesPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy && SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const statuses = (params.status ?? '').split(',').filter((s) => (PROFORMA_STATUSES as string[]).includes(s));
  const uuid = (value?: string) => (value && UUID.test(value) ? value : undefined);
  const date = (value?: string) => (value && DATE.test(value) ? value : undefined);
  const amount = (value?: string) => (value && MONEY.test(value) ? value : undefined);
  const filters = {
    search: params.search?.trim() || undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    customerId: uuid(params.customerId),
    assignedToId: uuid(params.assignedToId),
    quotationId: uuid(params.quotationId),
    dateFrom: date(params.dateFrom),
    dateTo: date(params.dateTo),
    amountMin: amount(params.amountMin),
    amountMax: amount(params.amountMax),
  };

  let data: PaginatedResponse<ProformaListItem>;
  let summary: ProformaSummary | null;
  let assignees: EnquiryAssignee[];
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null;
  let quotation: Pick<QuotationDetail, 'quotationNumber'> | null;
  try {
    [data, summary, assignees, customer, quotation] = await Promise.all([
      apiFetch<PaginatedResponse<ProformaListItem>>(`/proforma-invoices${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<ProformaSummary>('/proforma-invoices/summary').catch(() => null),
      apiFetch<EnquiryAssignee[]>('/proforma-invoices/assignees').catch(() => [] as EnquiryAssignee[]),
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
      filters.quotationId && can('quotation.read') ? apiFetch<QuotationDetail>(`/quotations/${filters.quotationId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <ProformaHeader canCreate={false} />
        <ErrorState title="Could not load proforma invoices" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('proforma.export') && data.meta.totalItems > 0 ? `/proforma-invoices/export${queryString({ ...filters, sortBy, sortDir })}` : null;
  const sortHref = (field: string) =>
    `/proforma-invoices${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;
  const SortHeader = ({ field, label, right = false }: { field: string; label: string; right?: boolean }) => {
    const active = sortBy === field;
    return (
      <th scope="col" className={right ? 'text-right' : undefined} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={sortHref(field)} scroll={false} className={clsx('sort-link', active && 'sort-link-active')}>
          {label}
          {active ? (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconSort size={12} className="opacity-40" />}
        </Link>
      </th>
    );
  };
  const firstRow = (data.meta.page - 1) * data.meta.pageSize;
  const issuedValue = summary?.issuedValue.map((v) => formatMoney(v.total, v.currency)).join(' · ');

  return (
    <div className="space-y-5">
      <ProformaHeader canCreate={can('proforma.create')} />

      {summary && (
        <section aria-label="Proforma invoice summary" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total PIs" value={summary.total} icon={<IconInvoice size={22} />} iconClassName="bg-accent" href="/proforma-invoices" />
          <StatCard label="Draft" value={summary.draft} icon={<IconPencil size={22} />} iconClassName="bg-ink-subtle" href="/proforma-invoices?status=DRAFT" />
          <StatCard
            label="Pending Approval"
            value={summary.pendingApproval}
            icon={<IconClock size={22} />}
            iconClassName="bg-warning"
            href="/proforma-invoices?status=PENDING_APPROVAL"
            note={summary.approvalRequired ? `${summary.approved} approved, not issued` : 'Approval is switched off'}
          />
          <StatCard label="Issued" value={summary.issued} icon={<IconCheckCircle size={22} />} iconClassName="bg-accent" href="/proforma-invoices?status=ISSUED" note={issuedValue ? `Live value ${issuedValue}` : undefined} />
          <StatCard label="Sent" value={summary.sent} icon={<IconArrowRight size={22} />} iconClassName="bg-success" href="/proforma-invoices?status=SENT" />
          <StatCard label="Cancelled" value={summary.cancelled} icon={<IconX size={22} />} iconClassName="bg-danger" href="/proforma-invoices?status=CANCELLED" />
        </section>
      )}

      <ProformaToolbar
        assignees={assignees}
        customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null}
        quotationLabel={filters.quotationId ? quotation?.quotationNumber ?? 'selected' : null}
        exportHref={exportHref}
      />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No proforma invoices match these filters' : 'No proforma invoices yet'}
            description={
              hasFilters ? 'Try another PI number, quotation number, customer or product, or clear the filters.' : undefined
            }
            action={
              hasFilters ? (
                <Link href="/proforma-invoices" className="btn-secondary">Clear filters</Link>
              ) : (
                can('proforma.create') && <Link href="/proforma-invoices/new" className="btn-primary"><IconPlus size={16} /> New Proforma Invoice</Link>
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
                    <SortHeader field="piNumber" label="PI No." />
                    <SortHeader field="piDate" label="PI Date" />
                    <th scope="col">Customer</th>
                    <th scope="col">Quotation</th>
                    <SortHeader field="grandTotal" label="Total" right />
                    <SortHeader field="dueDate" label="Payment Due" />
                    <th scope="col">Assigned To</th>
                    <SortHeader field="status" label="Status" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((pi, index) => (
                    <tr key={pi.id}>
                      <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                      <td className="whitespace-nowrap">
                        <Link href={`/proforma-invoices/${pi.id}`} className="link-pill font-mono text-sm font-semibold">{pi.piNumber}</Link>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(pi.piDate)}</td>
                      <td className="min-w-[180px]">
                        <span className="font-semibold text-ink">{pi.customer.name}</span>
                        <p className="font-mono text-xs text-ink-subtle">{pi.customer.customerCode}</p>
                      </td>
                      <td className="whitespace-nowrap">
                        {can('quotation.read') ? (
                          <Link href={`/quotations/${pi.quotation.id}`} className="link-pill font-mono text-sm">{pi.quotation.quotationNumber}</Link>
                        ) : (
                          <span className="font-mono text-sm">{pi.quotation.quotationNumber}</span>
                        )}
                        <p className="text-xs text-ink-subtle">Revision {pi.quotationRevision.revisionNumber}</p>
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(pi.grandTotal, pi.currency)}</td>
                      <td className="whitespace-nowrap">{pi.dueDate ? formatDate(pi.dueDate) : <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="whitespace-nowrap">{pi.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                      <td><ProformaStatusBadge status={pi.status} /></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link href={`/proforma-invoices/${pi.id}`} className="btn-secondary h-8 px-2.5 text-sm">View</Link>
                          {can('proforma.update') && pi.status === 'DRAFT' && (
                            <Link href={`/proforma-invoices/${pi.id}/edit`} className="btn-secondary h-8 px-2.5 text-sm" aria-label={`Edit ${pi.piNumber}`}><IconPencil size={15} /></Link>
                          )}
                          {can('proforma.download') && (
                            <a href={`/proforma-invoices/${pi.id}/pdf`} className="btn-secondary h-8 px-2.5 text-sm" aria-label={`Download PDF of ${pi.piNumber}`}><IconDownload size={15} /></a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/proforma-invoices"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="proforma invoices"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProformaHeader({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Proforma Invoices</h1>
        </div>
      </div>
      {canCreate && <Link href="/proforma-invoices/new" className="btn-primary h-11 px-5 text-base"><IconPlus size={18} /> New Proforma Invoice</Link>}
    </div>
  );
}
