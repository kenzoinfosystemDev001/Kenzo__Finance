import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { EnquiryAssignee, EnquiryListItem, EnquirySource, EnquirySummary, PaginatedResponse } from '@/lib/types';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { ENQUIRY_PRIORITIES, ENQUIRY_STATUSES, isFollowUpOverdue } from '@/lib/enquiry-labels';
import { formatDate, formatPhone } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { EnquiryPriorityBadge, EnquiryStatusBadge } from '@/components/enquiry-badges';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheckCircle,
  IconClock,
  IconInbox,
  IconPlus,
  IconQuote,
  IconRefresh,
  IconSort,
  IconStar,
  IconX,
} from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { EnquiryToolbar } from './enquiry-toolbar';
import { EnquiryRowActions } from './enquiry-row-actions';

export const metadata: Metadata = { title: 'Enquiry Management' };

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORT_FIELDS = ['enquiryNumber', 'enquiryDate', 'priority', 'status', 'nextFollowUpDate', 'createdAt'];

type Params = Record<
  'search' | 'status' | 'priority' | 'sourceId' | 'assignedToId' | 'customerId' | 'productId' | 'dateFrom' | 'dateTo' | 'overdueOnly' | 'sortBy' | 'sortDir' | 'page' | 'pageSize',
  string | undefined
>;

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy && SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const statuses = (params.status ?? '').split(',').filter((s) => (ENQUIRY_STATUSES as string[]).includes(s));
  const uuid = (value?: string) => (value && UUID.test(value) ? value : undefined);
  const filters = {
    search: params.search?.trim() || undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    priority: params.priority && (ENQUIRY_PRIORITIES as string[]).includes(params.priority) ? params.priority : undefined,
    sourceId: uuid(params.sourceId),
    assignedToId: uuid(params.assignedToId),
    customerId: uuid(params.customerId),
    productId: uuid(params.productId),
    dateFrom: params.dateFrom && DATE.test(params.dateFrom) ? params.dateFrom : undefined,
    dateTo: params.dateTo && DATE.test(params.dateTo) ? params.dateTo : undefined,
    overdueOnly: params.overdueOnly === 'true' ? 'true' : undefined,
  };

  let data: PaginatedResponse<EnquiryListItem>;
  let summary: EnquirySummary | null;
  let sources: EnquirySource[];
  let assignees: EnquiryAssignee[];
  try {
    [data, summary, sources, assignees] = await Promise.all([
      apiFetch<PaginatedResponse<EnquiryListItem>>(`/enquiries${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<EnquirySummary>('/enquiries/summary').catch(() => null),
      apiFetch<EnquirySource[]>('/enquiries/sources?includeInactive=true').catch(() => [] as EnquirySource[]),
      apiFetch<EnquiryAssignee[]>('/enquiries/assignees').catch(() => [] as EnquiryAssignee[]),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <EnquiryHeader canCreate={false} />
        <ErrorState title="Could not load enquiries" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('enquiry.export') && data.meta.totalItems > 0 ? `/enquiries/export${queryString({ ...filters, sortBy, sortDir })}` : null;
  const sortHref = (field: string) =>
    `/enquiries${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;
  const SortHeader = ({ field, label }: { field: string; label: string }) => {
    const active = sortBy === field;
    return (
      <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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
      <EnquiryHeader canCreate={can('enquiry.create')} canManageSources={can('enquiry.read')} />

      {summary && (
        <section aria-label="Enquiry summary" className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-7">
          <StatCard label="Total Enquiries" value={summary.total} icon={<IconInbox size={22} />} iconClassName="bg-accent" href="/enquiries" />
          <StatCard label="New" value={summary.new} icon={<IconStar size={22} />} iconClassName="bg-accent-hover" href="/enquiries?status=NEW" />
          <StatCard label="In Progress" value={summary.inProgress} icon={<IconRefresh size={22} />} iconClassName="bg-accent" href="/enquiries?status=ASSIGNED,IN_PROGRESS,REQUIREMENT_CLARIFICATION" />
          <StatCard
            label="Follow-up Pending"
            value={summary.followUpPending}
            icon={<IconClock size={22} />}
            iconClassName="bg-warning"
            href="/enquiries?status=FOLLOW_UP_PENDING"
            note={summary.overdueFollowUps > 0 ? <span className="text-danger">{summary.overdueFollowUps} overdue follow-up{summary.overdueFollowUps === 1 ? '' : 's'}</span> : undefined}
          />
          <StatCard label="Quotation Pending" value={summary.quotationPending} icon={<IconQuote size={22} />} iconClassName="bg-accent-hover" href="/enquiries?status=READY_FOR_QUOTATION" />
          <StatCard label="Converted to Quotation" value={summary.converted} icon={<IconCheckCircle size={22} />} iconClassName="bg-success" href="/enquiries?status=CONVERTED" />
          <StatCard label="Lost / Closed" value={summary.lostClosed} icon={<IconX size={22} />} iconClassName="bg-danger" href="/enquiries?status=LOST,CLOSED" />
        </section>
      )}

      <EnquiryToolbar sources={sources} assignees={assignees} exportHref={exportHref} />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No enquiries match these filters' : 'No enquiries yet'}
            description={hasFilters ? 'Try another enquiry ID, customer, product or phone number, or clear the filters.' : 'Record the first customer enquiry with its product requirements.'}
            action={
              hasFilters ? (
                <Link href="/enquiries" className="btn-secondary">Clear filters</Link>
              ) : (
                can('enquiry.create') && <Link href="/enquiries/new" className="btn-primary"><IconPlus size={16} /> Add Enquiry</Link>
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
                    <SortHeader field="enquiryNumber" label="Enquiry ID" />
                    <SortHeader field="enquiryDate" label="Enquiry Date" />
                    <th scope="col">Customer Name</th>
                    <th scope="col">Customer Type</th>
                    <th scope="col">Primary Contact</th>
                    <th scope="col">Phone</th>
                    <th scope="col" className="text-right">Products</th>
                    <th scope="col">Source</th>
                    <th scope="col">Assigned To</th>
                    <SortHeader field="priority" label="Priority" />
                    <SortHeader field="status" label="Status" />
                    <SortHeader field="nextFollowUpDate" label="Next Follow-up" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((enquiry, index) => {
                    const overdue = isFollowUpOverdue(enquiry.nextFollowUpDate, enquiry.status);
                    return (
                      <tr key={enquiry.id}>
                        <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                        <td className="whitespace-nowrap">
                          <Link href={`/enquiries/${enquiry.id}`} className="font-mono text-sm font-semibold text-ink hover:text-accent hover:underline">{enquiry.enquiryNumber}</Link>
                        </td>
                        <td className="whitespace-nowrap">{formatDate(enquiry.enquiryDate)}</td>
                        <td className="min-w-[180px]">
                          <span className="font-semibold text-ink">{enquiry.customer.name}</span>
                          <p className="font-mono text-xs text-ink-subtle">{enquiry.customer.customerCode}</p>
                        </td>
                        <td>{CUSTOMER_TYPE_LABELS[enquiry.customer.customerType]}</td>
                        <td className="whitespace-nowrap">{enquiry.contact?.name ?? dash}</td>
                        <td className="whitespace-nowrap tabular-nums">{enquiry.contact?.phone ? formatPhone(enquiry.contact.phone) : dash}</td>
                        <td className="text-right tabular-nums">{enquiry._count.items}</td>
                        <td>{enquiry.source?.name ?? dash}</td>
                        <td className="whitespace-nowrap">{enquiry.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                        <td><EnquiryPriorityBadge priority={enquiry.priority} /></td>
                        <td><EnquiryStatusBadge status={enquiry.status} /></td>
                        <td className={clsx('whitespace-nowrap', overdue && 'font-semibold text-danger')}>
                          {enquiry.nextFollowUpDate ? formatDate(enquiry.nextFollowUpDate) : dash}
                          {overdue && <p className="text-xs font-medium">Overdue</p>}
                        </td>
                        <td>
                          <EnquiryRowActions
                            enquiry={{ id: enquiry.id, enquiryNumber: enquiry.enquiryNumber, status: enquiry.status, customerId: enquiry.customer.id }}
                            permissions={permissions}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/enquiries"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="enquiries"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function EnquiryHeader({ canCreate, canManageSources = false }: { canCreate: boolean; canManageSources?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent"><IconInbox size={26} /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Enquiry Management</h1>
          <p className="text-base text-ink-muted">Track customer enquiries, requirements and follow-ups.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canManageSources && <Link href="/enquiries/follow-ups" className="btn-secondary h-11 px-4"><IconClock size={16} /> Follow-ups</Link>}
        {canManageSources && <Link href="/enquiries/sources" className="btn-secondary h-11 px-4">Sources</Link>}
        {canCreate && <Link href="/enquiries/new" className="btn-primary h-11 px-5 text-base"><IconPlus size={18} /> Add Enquiry</Link>}
      </div>
    </div>
  );
}
