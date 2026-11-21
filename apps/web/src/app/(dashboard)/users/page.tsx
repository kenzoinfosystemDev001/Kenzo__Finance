import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaginatedResponse, RoleWithPermissions, UserListItem, UserSummary } from '@/lib/types';
import { formatDate, formatDateTime, formatPhone } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { RoleChips, UserStatusBadge } from '@/components/user-badges';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconEye,
  IconPause,
  IconPlus,
  IconShield,
  IconSort,
  IconUsers,
  IconAlert,
} from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { UserToolbar } from './user-toolbar';

export const metadata: Metadata = { title: 'Users & Roles' };

interface SearchParams {
  search?: string;
  status?: string;
  roleCode?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
  pageSize?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];
const SORT_FIELDS = ['fullName', 'email', 'status', 'lastLoginAt', 'createdAt'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'];
const ROLE_CODE = /^[A-Z][A-Z0-9_]{1,49}$/;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  if (!can('user.read')) redirect('/dashboard');

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const sortBy = params.sortBy && SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'fullName';
  const sortDir =
    params.sortDir === 'asc' || params.sortDir === 'desc'
      ? params.sortDir
      : sortBy === 'fullName' || sortBy === 'email'
        ? 'asc'
        : 'desc';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // Only parameters the API's DTO accepts (it rejects unknown ones).
  const filters = {
    search: params.search?.trim().slice(0, 200) || undefined,
    status: params.status && STATUSES.includes(params.status) ? params.status : undefined,
    roleCode: params.roleCode && ROLE_CODE.test(params.roleCode) ? params.roleCode : undefined,
  };

  let data: PaginatedResponse<UserListItem>;
  let summary: UserSummary | null;
  let roles: RoleWithPermissions[] | null;

  try {
    [data, summary, roles] = await Promise.all([
      apiFetch<PaginatedResponse<UserListItem>>(`/users${queryString({ ...filters, sortBy, sortDir, page, pageSize })}`),
      apiFetch<UserSummary>('/users/summary').catch(() => null),
      can('role.read') ? apiFetch<RoleWithPermissions[]>('/roles').catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <div className="space-y-5">
        <UsersHeader canCreate={false} canSeeRoles={can('role.read')} />
        <ErrorState
          title="Could not load users"
          message={apiError?.messages[0] ?? 'The server could not be reached.'}
          correlationId={apiError?.body.correlationId}
        />
      </div>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const linkParams: Record<string, string | undefined> = {
    ...filters,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    pageSize: params.pageSize,
  };

  const sortHref = (field: string) => {
    const nextDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    return `/users${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: nextDir })}`;
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => {
    const active = sortBy === field;
    return (
      <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={sortHref(field)} scroll={false} className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-accent')}>
          {label}
          {active ? (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconSort size={12} className="opacity-40" />}
        </Link>
      </th>
    );
  };

  const firstRowNumber = (data.meta.page - 1) * data.meta.pageSize;

  return (
    <div className="space-y-5">
      <UsersHeader canCreate={can('user.create')} canSeeRoles={can('role.read')} />

      {summary && (
        <section aria-label="User summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Users" value={summary.total} icon={<IconUsers size={22} />} iconClassName="bg-accent" href="/users" />
          <StatCard label="Active Users" value={summary.active} icon={<IconCheck size={22} />} iconClassName="bg-success" href="/users?status=ACTIVE" />
          <StatCard label="Inactive Users" value={summary.inactive} icon={<IconPause size={22} />} iconClassName="bg-danger" href="/users?status=INACTIVE" />
          <StatCard label="Locked Users" value={summary.locked} icon={<IconAlert size={22} />} iconClassName="bg-orange-500" href="/users?status=LOCKED" />
        </section>
      )}

      <UserToolbar roles={roles ? roles.map((role) => ({ code: role.code, name: role.name })) : null} />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No users match these filters' : 'No users yet'}
            description={hasFilters ? 'Try another name, email or phone, or clear the filters.' : 'Create the first user account.'}
            action={
              hasFilters ? (
                <Link href="/users" className="btn-secondary">
                  Clear filters
                </Link>
              ) : (
                can('user.create') && (
                  <Link href="/users/new" className="btn-primary">
                    <IconPlus size={16} />
                    New user
                  </Link>
                )
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
                    <SortHeader field="fullName" label="Name" />
                    <SortHeader field="email" label="Email" />
                    <th scope="col">Phone</th>
                    <th scope="col">Roles</th>
                    <SortHeader field="status" label="Status" />
                    <SortHeader field="lastLoginAt" label="Last sign-in" />
                    <SortHeader field="createdAt" label="Created" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row, index) => (
                    <tr key={row.id}>
                      <td className="tabular-nums text-ink-subtle">{firstRowNumber + index + 1}</td>
                      <td className="min-w-[180px]">
                        <Link href={`/users/${row.id}`} className="font-semibold text-ink hover:text-accent hover:underline">
                          {row.fullName}
                        </Link>
                        {row.id === user?.id && <span className="ml-2 text-xs text-ink-subtle">(you)</span>}
                      </td>
                      <td className="max-w-[240px] truncate">{row.email}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {row.phone ? formatPhone(row.phone) : <span className="text-ink-subtle">&mdash;</span>}
                      </td>
                      <td className="min-w-[160px]">
                        <RoleChips roles={row.roles} max={2} />
                      </td>
                      <td>
                        <UserStatusBadge status={row.status} locked={row.locked} lockedUntil={row.lockedUntil} />
                      </td>
                      <td className="whitespace-nowrap">
                        {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-ink-subtle">Never</span>}
                      </td>
                      <td className="whitespace-nowrap">{formatDate(row.createdAt)}</td>
                      <td>
                        <div className="flex justify-end">
                          <Link href={`/users/${row.id}`} className="icon-btn" aria-label={`View ${row.fullName}`} title="View">
                            <IconEye />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/users"
              params={linkParams}
              noun="users"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function UsersHeader({ canCreate, canSeeRoles }: { canCreate: boolean; canSeeRoles: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <IconShield size={28} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Users &amp; Roles</h1>
          <p className="text-sm text-ink-muted">Who can sign in, and what each role is allowed to do.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canSeeRoles && (
          <Link href="/users/roles" className="btn-secondary h-11 px-4">
            <IconShield size={18} />
            Roles &amp; permissions
          </Link>
        )}
        {canCreate && (
          <Link href="/users/new" className="btn-primary h-11 px-5 text-base">
            <IconPlus size={18} />
            New user
          </Link>
        )}
      </div>
    </div>
  );
}
