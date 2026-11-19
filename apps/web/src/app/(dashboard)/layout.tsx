import { redirect } from 'next/navigation';
import { getCurrentUser, logoutAction } from '@/lib/auth-actions';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Server-side gate. The backend independently rejects unauthorised calls:
  // this only avoids rendering a shell the user cannot use.
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen">
      <Sidebar permissions={user.permissions} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-4 border-b border-border bg-surface px-4 lg:px-6">
          <div className="text-right">
            <p className="text-sm font-medium leading-tight text-ink">
              {user.fullName}
            </p>
            <p className="text-xs leading-tight text-ink-subtle">
              {user.roles.join(', ').replace(/_/g, ' ').toLowerCase() || 'No role'}
            </p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
