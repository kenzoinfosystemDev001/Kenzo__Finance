import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaginatedResponse, UserListItem } from '@/lib/types';
import { formatDateTime } from '@/lib/vendor-labels';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui';
import { IconX } from '@/components/icons';
import { PageSizeSelect } from '../../vendors/vendor-toolbar';

export const metadata: Metadata = { title: 'Audit log' };

interface AuditActor {
  id: string;
  fullName: string;
  email: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  parentEntityType: string | null;
  parentEntityId: string | null;
  summary: string | null;
  ipAddress: string | null;
  createdAt: string;
  actor: AuditActor | null;
}

interface AuditLogDetail extends AuditLogItem {
  before: unknown;
  after: unknown;
  userAgent: string | null;
}

interface AuditFacets {
  entityTypes: string[];
  actions: string[];
}

interface SearchParams {
  entityType?: string;
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: string;
  pageSize?: string;
  entry?: string;
}

const BASE_PATH = '/admin/audit-logs';
const PAGE_SIZES = [25, 50, 100];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: string | undefined, max: number) => value?.trim().slice(0, max) || undefined;

/**
 * Central audit log: every recorded change across modules, newest first.
 * Filters live in the URL so a filtered view can be bookmarked or shared; the
 * selected entry opens in a side panel (also URL-driven, via ?entry=).
 */
export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('audit.read')) redirect('/dashboard');

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // Only parameters the API's DTO accepts (it rejects unknown ones).
  const filters = {
    entityType: text(params.entityType, 100),
    action: text(params.action, 100),
    actorUserId: params.actorUserId && UUID.test(params.actorUserId) ? params.actorUserId : undefined,
    from: params.from && DATE_ONLY.test(params.from) ? params.from : undefined,
    to: params.to && DATE_ONLY.test(params.to) ? params.to : undefined,
    search: text(params.search, 200),
  };
  const entryId = params.entry && UUID.test(params.entry) ? params.entry : undefined;
  const hasFilters = Object.values(filters).some(Boolean);
  const linkParams: Record<string, string | undefined> = { ...filters, pageSize: params.pageSize };

  const [listResult, facets, users, entry] = await Promise.all([
    apiFetch<PaginatedResponse<AuditLogItem>>(`/audit-logs${queryString({ ...filters, page, pageSize })}`).then(
      (data) => ({ data, error: null as ApiError | null, failed: false }),
      (error: unknown) => ({ data: null, error: error instanceof ApiError ? error : null, failed: true }),
    ),
    apiFetch<AuditFacets>('/audit-logs/facets').catch(() => null),
    permissions.includes('user.read')
      ? apiFetch<PaginatedResponse<UserListItem>>('/users?pageSize=100&sortBy=fullName&sortDir=asc').catch(() => null)
      : Promise.resolve(null),
    entryId
      ? apiFetch<AuditLogDetail>(`/audit-logs/${entryId}`).then(
          (data) => ({ data, error: null as string | null }),
          (error: unknown) => ({ data: null, error: error instanceof ApiError ? error.messages[0] : 'The entry could not be loaded.' }),
        )
      : Promise.resolve(null),
  ]);

  const entryHref = (id: string) => `${BASE_PATH}${queryString({ ...linkParams, page: params.page, entry: id })}`;
  const closeHref = `${BASE_PATH}${queryString({ ...linkParams, page: params.page })}`;

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Audit log"
        description="Every recorded change across the application, newest first. Dates follow the business time zone."
        actions={
          <Link href="/admin" className="btn-secondary">
            Admin Console
          </Link>
        }
      />

      <form method="get" role="search" className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted xl:col-span-2">
          Search summary
          <input name="search" defaultValue={filters.search ?? ''} placeholder="e.g. Shree Computers" className="field-input h-9" maxLength={200} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Entity type
          {facets ? (
            <select name="entityType" defaultValue={filters.entityType ?? ''} className="field-input h-9">
              <option value="">All types</option>
              {withCurrent(facets.entityTypes, filters.entityType).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          ) : (
            <input name="entityType" defaultValue={filters.entityType ?? ''} placeholder="e.g. Vendor" className="field-input h-9" maxLength={100} />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Action
          {facets ? (
            <select name="action" defaultValue={filters.action ?? ''} className="field-input h-9">
              <option value="">All actions</option>
              {withCurrent(facets.actions, filters.action).map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          ) : (
            <input name="action" defaultValue={filters.action ?? ''} placeholder="e.g. vendor.create" className="field-input h-9" maxLength={100} />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          User
          {users ? (
            <select name="actorUserId" defaultValue={filters.actorUserId ?? ''} className="field-input h-9">
              <option value="">Anyone</option>
              {users.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          ) : (
            <input name="actorUserId" defaultValue={filters.actorUserId ?? ''} placeholder="User ID" className="field-input h-9" />
          )}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            From
            <input type="date" name="from" defaultValue={filters.from ?? ''} className="field-input h-9" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            To
            <input type="date" name="to" defaultValue={filters.to ?? ''} className="field-input h-9" />
          </label>
        </div>
        {params.pageSize && <input type="hidden" name="pageSize" value={params.pageSize} />}
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-6 xl:justify-end">
          {hasFilters && (
            <Link href={BASE_PATH} className="btn-secondary h-9">
              Clear filters
            </Link>
          )}
          <button type="submit" className="btn-primary h-9">
            Apply filters
          </button>
        </div>
      </form>

      <div className="card overflow-hidden">
        {listResult.failed || !listResult.data ? (
          <div className="p-4">
            <ErrorState
              title="Could not load the audit log"
              message={listResult.error?.messages[0] ?? 'The server could not be reached.'}
              correlationId={listResult.error?.body.correlationId}
            />
          </div>
        ) : listResult.data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No entries match these filters' : 'No audit entries yet'}
            description={hasFilters ? 'Try a wider date range or clear the filters.' : 'Changes made in the application are recorded here.'}
            action={
              hasFilters ? (
                <Link href={BASE_PATH} className="btn-secondary">
                  Clear filters
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">User</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Summary</th>
                    <th scope="col" className="text-right">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listResult.data.items.map((item) => (
                    <tr key={item.id} aria-selected={item.id === entryId || undefined} className={item.id === entryId ? 'bg-surface-muted' : undefined}>
                      <td className="whitespace-nowrap tabular-nums">{formatDateTime(item.createdAt)}</td>
                      <td>
                        <ActorCell actor={item.actor} />
                      </td>
                      <td className="whitespace-nowrap font-mono text-sm">{item.action}</td>
                      <td>
                        <Badge>{item.entityType}</Badge>
                        {item.entityId && <span className="ml-2 font-mono text-xs text-ink-subtle">{shortId(item.entityId)}</span>}
                      </td>
                      <td className="max-w-md">{item.summary ?? <span className="text-ink-subtle">—</span>}</td>
                      <td className="text-right">
                        <Link href={entryHref(item.id)} scroll={false} className="text-sm text-accent hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={listResult.data.meta}
              basePath={BASE_PATH}
              params={linkParams}
              noun="entries"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>

      {entry && <EntryDrawer closeHref={closeHref} entry={entry.data} error={entry.error} />}
    </div>
  );
}

/** Facet lists come from existing rows; keep a value from the URL selectable even if it is not among them. */
function withCurrent(options: string[], current: string | undefined): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function ActorCell({ actor }: { actor: AuditActor | null }) {
  if (!actor) return <span className="text-ink-subtle">System</span>;
  return (
    <div className="min-w-0">
      <p className="font-medium text-ink">{actor.fullName}</p>
      <p className="text-xs text-ink-muted">{actor.email}</p>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</h3>
      {value === null || value === undefined ? (
        <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-subtle">No value recorded</p>
      ) : (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs text-ink">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EntryDrawer({ closeHref, entry, error }: { closeHref: string; entry: AuditLogDetail | null; error: string | null }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} aria-label="Close details" className="absolute inset-0 bg-ink/30" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-entry-title"
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface shadow-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="audit-entry-title" className="text-lg font-semibold text-ink">
              Audit entry
            </h2>
            {entry && <p className="mt-0.5 font-mono text-sm text-ink-muted">{entry.action}</p>}
          </div>
          <Link href={closeHref} scroll={false} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Close">
            <IconX size={18} />
          </Link>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {!entry ? (
            <ErrorState title="Entry unavailable" message={error ?? 'The entry could not be loaded.'} />
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Field label="When" value={formatDateTime(entry.createdAt)} />
                <Field label="User" value={entry.actor ? `${entry.actor.fullName} (${entry.actor.email})` : 'System'} />
                <Field label="Entity" value={`${entry.entityType}${entry.entityId ? ` · ${entry.entityId}` : ''}`} />
                {entry.parentEntityType && (
                  <Field label="Belongs to" value={`${entry.parentEntityType}${entry.parentEntityId ? ` · ${entry.parentEntityId}` : ''}`} />
                )}
                <Field label="IP address" value={entry.ipAddress ?? '—'} />
                <Field label="Summary" value={entry.summary ?? '—'} wide />
                {entry.userAgent && <Field label="Browser" value={entry.userAgent} wide />}
              </dl>
              <JsonBlock label="Before" value={entry.before} />
              <JsonBlock label="After" value={entry.after} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{value}</dd>
    </div>
  );
}
