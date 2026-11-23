import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, EnquiryAssignee, EnquiryDetail, PaginatedResponse, QuotationListItem, QuotationSummary } from '@/lib/types';
import { formatMoney, QUOTATION_STATUSES } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { PastValidityBadge, QuotationStatusBadge } from '@/components/quotation-badges';
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconCheckCircle,
  IconClock,
  IconFile,
  IconPencil,
  IconPlus,
  IconQuote,
  IconRefresh,
  IconSort,
  IconX,
  IconArrowRight,
} from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { QuotationToolbar } from './quotation-toolbar';
import { QuotationRowActions } from './quotation-row-actions';

export const metadata: Metadata = { title: 'Quotation Management' };

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const SORT_FIELDS = ['quotationNumber', 'createdAt', 'currentTotal', 'status', 'updatedAt'];

type Params = Record<
  | 'search' | 'status' | 'customerId' | 'assignedToId' | 'enquiryId' | 'dateFrom' | 'dateTo' | 'validFrom' | 'validTo'
  | 'amountMin' | 'amountMax' | 'revisedOnly' | 'sortBy' | 'sortDir' | 'page' | 'pageSize',
  string | undefined
>;

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy && SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const statuses = (params.status ?? '').split(',').filter((s) => (QUOTATION_STATUSES as string[]).includes(s));
  const uuid = (value?: string) => (value && UUID.test(value) ? value : undefined);
  const date = (value?: string) => (value && DATE.test(value) ? value : undefined);
  const amount = (value?: string) => (value && MONEY.test(value) ? value : undefined);
  const filters = {
    search: params.search?.trim() || undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    customerId: uuid(params.customerId),
    assignedToId: uuid(params.assignedToId),
    enquiryId: uuid(params.enquiryId),
    dateFrom: date(params.dateFrom),
    dateTo: date(params.dateTo),
    validFrom: date(params.validFrom),
    validTo: date(params.validTo),
    amountMin: amount(params.amountMin),
    amountMax: amount(params.amountMax),
    revisedOnly: params.revisedOnly === 'true' ? 'true' : undefined,
  };

  let data: PaginatedResponse<QuotationListItem>;
  let summary: QuotationSummary | null;
  let assignees: EnquiryAssignee[];
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null;
  let enquiry: Pick<EnquiryDetail, 'enquiryNumber'> | null;
  try {
    [data, summary, assignees, customer, enquiry] = await Promise.all([
      apiFetch<PaginatedResponse<QuotationListItem>>(`/quotations${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<QuotationSummary>('/quotations/summary').catch(() => null),
      apiFetch<EnquiryAssignee[]>('/quotations/assignees').catch(() => [] as EnquiryAssignee[]),
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
      filters.enquiryId ? apiFetch<EnquiryDetail>(`/enquiries/${filters.enquiryId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <QuotationHeader canCreate={false} canReports={false} />
        <ErrorState title="Could not load quotations" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('quotation.export') && data.meta.totalItems > 0 ? `/quotations/export${queryString({ ...filters, sortBy, sortDir })}` : null;
  const sortHref = (field: string) =>
    `/quotations${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;
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
  const dash = <span className="text-ink-subtle">&mdash;</span>;

  return (
    <div className="space-y-5">
      <QuotationHeader canCreate={can('quotation.create_manual')} canReports={can('quotation.reports')} />

      {summary && (
        <section aria-label="Quotation summary" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Quotations" value={summary.total} icon={<IconQuote size={22} />} iconClassName="bg-accent" href="/quotations" />
          <StatCard label="Draft" value={summary.draft} icon={<IconPencil size={22} />} iconClassName="bg-ink-subtle" href="/quotations?status=DRAFT" />
          <StatCard
            label="Pending Approval"
            value={summary.pendingApproval}
            icon={<IconClock size={22} />}
            iconClassName="bg-warning"
            href="/quotations?status=PENDING_APPROVAL"
            note={summary.approvalRequired ? `${summary.approved} approved, not yet sent` : 'Approval is switched off'}
          />
          <StatCard label="Sent" value={summary.sent} icon={<IconArrowRight size={22} />} iconClassName="bg-accent-hover" href="/quotations?status=SENT" />
          <StatCard label="Under Negotiation" value={summary.underNegotiation} icon={<IconRefresh size={22} />} iconClassName="bg-accent" href="/quotations?status=UNDER_NEGOTIATION" />
          <StatCard label="Accepted" value={summary.accepted} icon={<IconCheckCircle size={22} />} iconClassName="bg-success" href="/quotations?status=ACCEPTED" />
          <StatCard label="Rejected" value={summary.rejected} icon={<IconX size={22} />} iconClassName="bg-danger" href="/quotations?status=REJECTED" />
          <StatCard
            label="Expired"
            value={summary.expired}
            icon={<IconFile size={22} />}
            iconClassName="bg-warning"
            href="/quotations?status=EXPIRED"
            note={
              [summary.pastValidity > 0 ? `${summary.pastValidity} open past validity` : null, summary.cancelled > 0 ? `${summary.cancelled} cancelled` : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        </section>
      )}

      <QuotationToolbar
        assignees={assignees}
        customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null}
        enquiryLabel={filters.enquiryId ? enquiry?.enquiryNumber ?? 'selected' : null}
        exportHref={exportHref}
      />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No quotations match these filters' : 'No quotations yet'}
            description={
              hasFilters ? 'Try another quotation number, enquiry number, customer or product, or clear the filters.' : undefined
            }
            action={
              hasFilters ? (
                <Link href="/quotations" className="btn-secondary">Clear filters</Link>
              ) : (
                can('quotation.create_manual') && <Link href="/quotations/new" className="btn-primary"><IconPlus size={16} /> New Quotation</Link>
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
                    <SortHeader field="quotationNumber" label="Quotation No." />
                    <th scope="col">Date</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Enquiry</th>
                    <th scope="col" className="text-right">Revision</th>
                    <SortHeader field="currentTotal" label="Grand Total" right />
                    <th scope="col">Valid Until</th>
                    <th scope="col">Assigned To</th>
                    <SortHeader field="status" label="Status" />
                    <SortHeader field="createdAt" label="Created" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((q, index) => (
                    <tr key={q.id}>
                      <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                      <td className="whitespace-nowrap">
                        <Link href={`/quotations/${q.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{q.quotationNumber}</Link>
                      </td>
                      <td className="whitespace-nowrap">{q.quotationDate ? formatDate(q.quotationDate) : dash}</td>
                      <td className="min-w-[180px]">
                        <span className="font-semibold text-ink">{q.customer.name}</span>
                        <p className="font-mono text-xs text-ink-subtle">{q.customer.customerCode}</p>
                      </td>
                      <td className="whitespace-nowrap">
                        {q.enquiry ? (
                          can('enquiry.read') ? <Link href={`/enquiries/${q.enquiry.id}`} className="font-mono text-sm hover:text-accent hover:underline">{q.enquiry.enquiryNumber}</Link> : <span className="font-mono text-sm">{q.enquiry.enquiryNumber}</span>
                        ) : (
                          <span className="text-ink-subtle">Manual</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">R{q.currentRevisionNumber}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(q.currentTotal, q.currency)}</td>
                      <td className={clsx('whitespace-nowrap', q.pastValidity && 'font-semibold text-warning')}>
                        {q.validUntil ? formatDate(q.validUntil) : dash}
                        {q.pastValidity && <div className="mt-0.5"><PastValidityBadge /></div>}
                      </td>
                      <td className="whitespace-nowrap">{q.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                      <td><QuotationStatusBadge status={q.status} /></td>
                      <td className="whitespace-nowrap">{formatDate(q.createdAt)}</td>
                      <td>
                        <QuotationRowActions
                          quotation={{ id: q.id, quotationNumber: q.quotationNumber, status: q.status, currentRevisionNumber: q.currentRevisionNumber, customerId: q.customer.id, enquiryId: q.enquiry?.id ?? null }}
                          permissions={permissions}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/quotations"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="quotations"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function QuotationHeader({ canCreate, canReports }: { canCreate: boolean; canReports: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Quotation Management</h1>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canReports && <Link href="/quotations/reports" className="btn-secondary h-11 px-4"><IconChart size={16} /> Reports</Link>}
        {canCreate && <Link href="/quotations/new" className="btn-primary h-11 px-5 text-base"><IconPlus size={18} /> New Quotation</Link>}
      </div>
    </div>
  );
}
