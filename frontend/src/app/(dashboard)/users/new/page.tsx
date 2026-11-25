import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { RoleWithPermissions } from '@/lib/types';
import { SUPER_ADMIN_ROLE } from '@/lib/user-labels';
import { ErrorState, PageHeader } from '@/components/ui';
import { IconChevronLeft } from '@/components/icons';
import { CreateUserForm } from './create-user-form';

export const metadata: Metadata = { title: 'New user' };

export default async function NewUserPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('user.create')) redirect('/users');

  let roles: RoleWithPermissions[];
  try {
    roles = await apiFetch<RoleWithPermissions[]>('/roles');
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="New user" />
        <ErrorState
          title="Could not load the roles to assign"
          message={
            apiError?.status === 403
              ? 'Creating a user needs the list of roles, which requires the role.read permission. Ask an administrator to grant it.'
              : (apiError?.messages[0] ?? 'The server could not be reached.')
          }
          correlationId={apiError?.body.correlationId}
        />
      </div>
    );
  }

  // Only a Super Admin can assign the Super Admin role; listing it for anyone
  // else would offer a choice that is always refused.
  const isSuperAdmin = user?.roles.includes(SUPER_ADMIN_ROLE) ?? false;
  const assignable = isSuperAdmin ? roles : roles.filter((role) => role.code !== SUPER_ADMIN_ROLE);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/users" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent">
        <IconChevronLeft size={16} /> All users
      </Link>
      <PageHeader title="New user" description="Create an account with an initial password and one or more roles." />
      <CreateUserForm roles={assignable} />
    </div>
  );
}
