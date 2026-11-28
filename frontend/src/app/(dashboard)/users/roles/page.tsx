import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PermissionInfo, RoleWithPermissions } from '@/lib/types';
import { SUPER_ADMIN_ROLE } from '@/lib/user-labels';
import { Badge, ErrorState, PageHeader } from '@/components/ui';
import { IconChevronLeft } from '@/components/icons';
import { PermissionMatrix } from './permission-matrix';

export const metadata: Metadata = { title: 'Roles & permissions' };

export default async function RolesPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  if (!can('role.read')) redirect(can('user.read') ? '/users' : '/dashboard');

  let roles: RoleWithPermissions[];
  let catalogue: PermissionInfo[];
  try {
    [roles, catalogue] = await Promise.all([
      apiFetch<RoleWithPermissions[]>('/roles'),
      apiFetch<PermissionInfo[]>('/roles/permissions'),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <div className="space-y-5">
        <PageHeader title="Roles & permissions" />
        <ErrorState
          title="Could not load roles"
          message={apiError?.messages[0] ?? 'The server could not be reached.'}
          correlationId={apiError?.body.correlationId}
        />
      </div>
    );
  }

  const canManage = can('role.manage');

  return (
    <div className="space-y-5">
      {can('user.read') && (
        <Link href="/users" className="link-pill-neutral text-sm">
          <IconChevronLeft size={16} /> Users
        </Link>
      )}
      <PageHeader
        title="Roles & permissions"
        description="Each user's access is the combination of the permissions of every role they hold."
      />

      <section className="card overflow-hidden" aria-label="Roles">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Code</th>
                <th scope="col">Description</th>
                <th scope="col" className="text-right">Users</th>
                <th scope="col" className="text-right">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="whitespace-nowrap font-semibold text-ink">
                    {role.name}
                    {role.code === SUPER_ADMIN_ROLE ? (
                      <span className="ml-2"><Badge tone="warning">Fixed</Badge></span>
                    ) : (
                      role.isSystem && <span className="ml-2"><Badge>System</Badge></span>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-sm text-ink-muted">{role.code}</td>
                  <td className="min-w-[200px] text-sm text-ink-muted">{role.description ?? <span className="text-ink-subtle">&mdash;</span>}</td>
                  <td className="text-right tabular-nums">
                    {can('user.read') && role.userCount > 0 ? (
                      <Link href={`/users?roleCode=${encodeURIComponent(role.code)}`} className="link-pill">
                        {role.userCount}
                      </Link>
                    ) : (
                      role.userCount
                    )}
                  </td>
                  <td className="text-right tabular-nums">{role.permissions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PermissionMatrix roles={roles} catalogue={catalogue} editable={canManage} />
    </div>
  );
}
