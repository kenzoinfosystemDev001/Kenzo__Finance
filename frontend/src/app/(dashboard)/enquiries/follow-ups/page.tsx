import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  CustomerDetail,
  EnquiryAssignee,
  FollowUpBoardEnquiry,
  FollowUpBoardRecord,
  FollowUpCounts,
  PaginatedResponse,
} from '@/lib/types';
import { FOLLOW_UP_METHOD_LABELS, FOLLOW_UP_OUTCOME_LABELS } from '@/lib/enquiry-labels';
import { formatDate, formatDateTime, formatPhone } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui';
import { EnquiryPriorityBadge, EnquiryStatusBadge } from '@/components/enquiry-badges';
import { IconAlert, IconCheckCircle, IconClock, IconPlus, IconStar } from '@/components/icons';
import { PageSizeSelect } from '../../vendors/vendor-toolbar';
import { FollowUpFilters } from './follow-up-filters';

export const metadata: Metadata = { title: 'Follow-ups' };

const VIEWS = ['today', 'upcoming', 'overdue', 'completed'] as const;
type View = (typeof VIEWS)[number];
const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<'view' | 'assignedToId' | 'customerId' | 'dateFrom' | 'dateTo' | 'page' | 'pageSize', string | undefined>;
type Board = { view: View } & PaginatedResponse<FollowUpBoardEnquiry | FollowUpBoardRecord>;

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const canRecord = permissions.includes('enquiry.manage_follow_ups');

  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : 'today';
  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const filters = {
    assignedToId: params.assignedToId && UUID.test(params.assignedToId) ? params.assignedToId : undefined,
    customerId: params.customerId && UUID.test(params.customerId) ? params.customerId : undefined,
    dateFrom: params.dateFrom && DATE.test(params.dateFrom) ? params.dateFrom : undefined,
    dateTo: params.dateTo && DATE.test(params.dateTo) ? params.dateTo : undefined,
  };

  let board: Board;
  let counts: FollowUpCounts | null;
  let assignees: EnquiryAssignee[];
  let customer: CustomerDetail | null;
  try {
    [board, counts, assignees, customer] = await Promise.all([
      apiFetch<Board>(`/enquiries/follow-ups${queryString({ ...filters, view, page: params.page ?? '1', pageSize })}`),
      apiFetch<FollowUpCounts>(`/enquiries/follow-ups/counts${queryString({ assignedToId: filters.assignedToId, customerId: filters.customerId, dateFrom: filters.dateFrom, dateTo: filters.dateTo })}`).catch(() => null),
      apiFetch<EnquiryAssignee[]>('/enquiries/assignees').catch(() => [] as EnquiryAssignee[]),
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <PageHeader title="Follow-ups" actions={<Link href="/enquiries" className="btn-secondary">Back to enquiries</Link>} />
        <ErrorState title="Could not load follow-ups" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const viewHref = (v: View) => `/enquiries/follow-ups${queryString({ ...filters, view: v, pageSize: params.pageSize })}`;
  const tiles: Array<{ key: View; label: string; count?: number; icon: React.ReactNode; color: string }> = [
    { key: 'today', label: "Today's Follow-ups", count: counts?.today, icon: <IconClock size={22} />, color: 'bg-accent' },
    { key: 'upcoming', label: 'Upcoming', count: counts?.upcoming, icon: <IconStar size={22} />, color: 'bg-accent-hover' },
    { key: 'overdue', label: 'Overdue', count: counts?.overdue, icon: <IconAlert size={22} />, color: 'bg-danger' },
    { key: 'completed', label: 'Completed', count: counts?.completed, icon: <IconCheckCircle size={22} />, color: 'bg-success' },
  ];
  const dash = <span className="text-ink-subtle">&mdash;</span>;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Follow-ups"
        description="Planned and recorded customer follow-ups across open enquiries."
        actions={<Link href="/enquiries" className="btn-secondary">Back to enquiries</Link>}
      />

      <nav aria-label="Follow-up views" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map((t) => {
          const active = t.key === view;
          const alarming = t.key === 'overdue' && (t.count ?? 0) > 0;
          return (
            <Link
              key={t.key}
              href={viewHref(t.key)}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'card block p-4 transition-shadow hover:shadow-popover',
                active && 'ring-2 ring-accent',
                alarming && 'border-danger/40 bg-danger-subtle',
                alarming && active && 'ring-danger',
              )}
            >
              <div className="flex items-center gap-4">
                <span aria-hidden className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm', t.color)}>{t.icon}</span>
                <div className="min-w-0">
                  <p className={clsx('text-2xl font-bold tabular-nums leading-tight', alarming ? 'text-danger' : 'text-ink')}>{t.count ?? '—'}</p>
                  <p className="text-sm font-medium leading-tight text-ink-muted">{t.label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </nav>
      {counts && hasFilters && <p className="-mt-2 text-xs text-ink-subtle">Card counts reflect the employee filter only; the list below applies all filters.</p>}

      <FollowUpFilters assignees={assignees} customer={customer ? { id: customer.id, name: customer.name } : null} />

      <div className="card overflow-hidden">
        {board.items.length === 0 ? (
          <EmptyState
            title={view === 'completed' ? 'No recorded follow-ups' : `No ${view === 'today' ? "follow-ups due today" : `${view} follow-ups`}`}
            description={hasFilters ? 'Try clearing the filters.' : view === 'completed' ? 'Follow-ups recorded on enquiries appear here.' : 'Open enquiries with a planned next follow-up appear here.'}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              {view === 'completed' ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Follow-up Date</th>
                      <th scope="col">Enquiry</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Method</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Discussion</th>
                      <th scope="col">Next Follow-up</th>
                      <th scope="col">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(board.items as FollowUpBoardRecord[]).map((f) => (
                      <tr key={f.id}>
                        <td className="whitespace-nowrap">{formatDateTime(f.followUpDate)}</td>
                        <td className="whitespace-nowrap">
                          <Link href={`/enquiries/${f.enquiry.id}?tab=followups`} className="link-pill font-mono text-sm font-semibold">{f.enquiry.enquiryNumber}</Link>
                          <div className="mt-0.5"><EnquiryStatusBadge status={f.enquiry.status} /></div>
                        </td>
                        <td className="min-w-[160px]">{f.enquiry.customer.name}{f.contact && <p className="text-xs text-ink-subtle">with {f.contact.name}</p>}</td>
                        <td>{FOLLOW_UP_METHOD_LABELS[f.method]}</td>
                        <td>{FOLLOW_UP_OUTCOME_LABELS[f.outcome]}</td>
                        <td className="max-w-[320px] text-sm text-ink-muted"><p className="line-clamp-2">{f.discussionSummary}</p></td>
                        <td className="whitespace-nowrap">{f.nextFollowUpDate ? formatDate(f.nextFollowUpDate) : dash}</td>
                        <td className="whitespace-nowrap">{f.createdBy?.fullName ?? dash}{f.assignedTo && <p className="text-xs text-ink-subtle">Assigned: {f.assignedTo.fullName}</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Next Follow-up</th>
                      <th scope="col">Enquiry</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Status</th>
                      <th scope="col">Last Follow-up</th>
                      <th scope="col">Assigned To</th>
                      {canRecord && <th scope="col" className="text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(board.items as FollowUpBoardEnquiry[]).map((e) => {
                      const last = e.followUps[0];
                      const overdue = view === 'overdue';
                      return (
                        <tr key={e.id} className={clsx(overdue && 'bg-danger-subtle/60')}>
                          <td className={clsx('whitespace-nowrap', overdue && 'font-semibold text-danger')}>
                            {e.nextFollowUpDate ? formatDate(e.nextFollowUpDate) : dash}
                            {overdue && <p className="text-xs font-medium">Overdue</p>}
                          </td>
                          <td className="whitespace-nowrap">
                            <Link href={`/enquiries/${e.id}`} className="link-pill font-mono text-sm font-semibold">{e.enquiryNumber}</Link>
                          </td>
                          <td className="min-w-[160px] font-medium">{e.customer.name}</td>
                          <td className="whitespace-nowrap">
                            {e.customerContact?.name ?? dash}
                            {e.customerContact?.phone && <p className="text-xs tabular-nums text-ink-subtle">{formatPhone(e.customerContact.phone)}</p>}
                          </td>
                          <td><EnquiryPriorityBadge priority={e.priority} /></td>
                          <td><EnquiryStatusBadge status={e.status} /></td>
                          <td className="max-w-[300px] text-sm">
                            {last ? (
                              <>
                                <p className="text-ink">{formatDate(last.followUpDate)} &middot; {FOLLOW_UP_OUTCOME_LABELS[last.outcome]}</p>
                                <p className="line-clamp-1 text-xs text-ink-subtle">{last.discussionSummary}</p>
                              </>
                            ) : (
                              <span className="text-ink-subtle">None recorded</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap">{e.assignedTo?.fullName ?? <span className="text-ink-subtle">Unassigned</span>}</td>
                          {canRecord && (
                            <td className="text-right">
                              <Link href={`/enquiries/${e.id}?tab=followups&add=1`} className="btn-secondary whitespace-nowrap px-3 py-1.5 text-sm"><IconPlus size={14} /> Record</Link>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <Pagination
              meta={board.meta}
              basePath="/enquiries/follow-ups"
              params={{ ...filters, view, pageSize: params.pageSize }}
              noun={view === 'completed' ? 'follow-ups' : 'enquiries'}
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}
