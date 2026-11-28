import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaginatedResponse, RoleWithPermissions, UserActivityEntry, UserDetail } from '@/lib/types';
import { formatDate, formatDateTime, formatPhone } from '@/lib/vendor-labels';
import { actionLabel, groupByModule, moduleLabel, SUPER_ADMIN_ROLE, userActivityLabel } from '@/lib/user-labels';
import { DefinitionList, EmptyState, ErrorState, Pagination, SectionCard } from '@/components/ui';
import { UserStatusBadge } from '@/components/user-badges';
import { ProfilePhotoControls } from '@/components/profile-photo-controls';
import { IconChevronLeft, IconClock, IconMail, IconPhone } from '@/components/icons';
import { UserActions } from './user-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVITY_PAGE_SIZE = 20;

async function loadUser(id: string): Promise<UserDetail> {
  if (!UUID.test(id)) notFound();
  try {
    return await apiFetch<UserDetail>(`/users/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: 'User' };
  try {
    const user = await apiFetch<UserDetail>(`/users/${id}`);
    return { title: user.fullName };
  } catch {
    return { title: 'User' };
  }
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; created?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const actor = await getCurrentUser();
  const permissions = actor?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  if (!can('user.read')) redirect('/dashboard');

  const user = await loadUser(id);
  const activityPage = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const [activity, allRoles] = await Promise.all([
    apiFetch<PaginatedResponse<UserActivityEntry>>(
      `/users/${user.id}/activity${queryString({ page: activityPage, pageSize: ACTIVITY_PAGE_SIZE })}`,
    ).catch((error: unknown) => (error instanceof ApiError ? error : null)),
    can('user.update') && can('role.read')
      ? apiFetch<RoleWithPermissions[]>('/roles').catch(() => null)
      : Promise.resolve(null),
  ]);

  // Mirrors apps/api/src/users/user-rules.ts so the page does not offer what
  // the API will refuse. The API remains the authority.
  const isSelf = actor?.id === user.id;
  const actorIsSuperAdmin = actor?.roles.includes(SUPER_ADMIN_ROLE) ?? false;
  const targetIsSuperAdmin = user.roles.some((role) => role.code === SUPER_ADMIN_ROLE);
  const protectedTarget = targetIsSuperAdmin && !actorIsSuperAdmin && !isSelf;

  const flags = {
    canEditProfile: can('user.update') && !protectedTarget,
    canEditRoles: can('user.update') && !isSelf && !protectedTarget,
    canChangeStatus: can('user.archive') && !isSelf && !protectedTarget,
    canResetPassword: can('user.update') && !isSelf && !protectedTarget,
  };
  const assignableRoles = allRoles
    ? actorIsSuperAdmin
      ? allRoles
      : allRoles.filter((role) => role.code !== SUPER_ADMIN_ROLE)
    : null;

  const permissionGroups = groupByModule(user.permissions);
  const holdsAdminPermission = can('user.update') || can('user.archive');

  return (
    <div className="space-y-5">
      <Link href="/users" className="link-pill-neutral text-sm">
        <IconChevronLeft size={16} /> All users
      </Link>

      {query.created && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">
          User created. Share the initial password with them securely; it is not shown again.
        </p>
      )}
      {isSelf && (
        <p className="rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm text-ink-muted">
          This is your own account. Change your password from{' '}
          <Link href="/account" className="link-pill font-medium">
            My account
          </Link>
          . Your roles and status can only be changed by another administrator.
        </p>
      )}
      {protectedTarget && holdsAdminPermission && (
        <p className="rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm text-ink-muted">
          Only a Super Admin can manage a Super Admin account.
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <ProfilePhotoControls
              owner={user.id}
              fullName={user.fullName}
              initialVersion={user.profilePhoto ? user.profilePhoto.sha256.slice(0, 16) : null}
              size="lg"
              canEdit={isSelf || (can('user.update') && !protectedTarget)}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink">{user.fullName}</h1>
                <UserStatusBadge status={user.status} locked={user.locked} lockedUntil={user.lockedUntil} showUntil />
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-muted">
                <li className="inline-flex items-center gap-1.5"><IconMail size={14} /> {user.email}</li>
                {user.phone && <li className="inline-flex items-center gap-1.5"><IconPhone size={14} /> {formatPhone(user.phone)}</li>}
                <li className="inline-flex items-center gap-1.5">
                  <IconClock size={14} /> {user.lastLoginAt ? `Last sign-in ${formatDateTime(user.lastLoginAt)}` : 'Never signed in'}
                </li>
              </ul>
            </div>
          </div>
          <UserActions
            user={{
              id: user.id,
              fullName: user.fullName,
              phone: user.phone,
              status: user.status,
              locked: user.locked,
              roleCodes: user.roles.map((role) => role.code),
            }}
            flags={flags}
            roles={assignableRoles}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-ink">Profile</h2>
          <DefinitionList
            items={[
              { label: 'Full name', value: user.fullName },
              { label: 'Email (sign-in)', value: user.email },
              { label: 'Phone', value: formatPhone(user.phone) },
              {
                label: 'Status',
                value: <UserStatusBadge status={user.status} locked={user.locked} lockedUntil={user.lockedUntil} showUntil />,
              },
              { label: 'Last sign-in', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never' },
              { label: 'Failed sign-in attempts', value: String(user.failedLoginAttempts) },
              { label: 'Locked until', value: user.lockedUntil ? formatDateTime(user.lockedUntil) : 'Not locked' },
              { label: 'Created', value: formatDateTime(user.createdAt) },
              { label: 'Last updated', value: formatDateTime(user.updatedAt) },
            ]}
          />
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-semibold text-ink">Roles</h2>
          {user.roles.length === 0 ? (
            <p className="text-sm text-ink-muted">No roles assigned. This user has no access.</p>
          ) : (
            <ul className="space-y-2">
              {user.roles.map((role) => (
                <li key={role.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-semibold text-ink">{role.name}</p>
                  <p className="text-xs text-ink-subtle">
                    <span className="font-mono">{role.code}</span> &middot; assigned {formatDate(role.assignedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SectionCard
        title="Effective permissions"
        description={`${user.permissions.length} permission(s) from all assigned roles.`}
      >
        {permissionGroups.length === 0 ? (
          <p className="text-sm text-ink-muted">This user has no permissions.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {permissionGroups.map((group) => (
              <div key={group.module}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{moduleLabel(group.module)}</h3>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {group.items.map((permission) => (
                    <li key={permission.code} className="chip" title={permission.description ?? permission.code}>
                      {actionLabel(permission.action)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activity" description="Account changes and sign-in events, newest first." padded={false}>
        {activity instanceof ApiError || activity === null ? (
          <div className="p-4">
            <ErrorState
              title="Could not load activity"
              message={activity?.messages[0] ?? 'The server could not be reached.'}
              correlationId={activity?.body.correlationId}
            />
          </div>
        ) : activity.items.length === 0 ? (
          <EmptyState title="No activity yet" description="Changes to this account and its sign-ins will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Event</th>
                    <th scope="col">Details</th>
                    <th scope="col">By</th>
                    <th scope="col">IP address</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.items.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                      <td className="whitespace-nowrap font-medium">{userActivityLabel(entry.action)}</td>
                      <td className="min-w-[240px] text-sm text-ink-muted">{entry.summary ?? <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="whitespace-nowrap">{entry.actor?.fullName ?? <span className="text-ink-subtle">System</span>}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-ink-subtle">{entry.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ActivityPagination userId={user.id} meta={activity.meta} />
          </>
        )}
      </SectionCard>
    </div>
  );
}

/** Activity is the only paginated list on this page, so it owns `page`. */
function ActivityPagination({ userId, meta }: { userId: string; meta: PaginatedResponse<unknown>['meta'] }) {
  if (meta.totalPages <= 1) {
    return <p className="border-t border-border px-4 py-3 text-sm text-ink-muted">{meta.totalItems} event(s)</p>;
  }
  return <Pagination meta={meta} basePath={`/users/${userId}`} params={{}} noun="events" />;
}
