import { redirect } from 'next/navigation';
import { getSession, logoutAction } from '@/lib/auth-actions';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // A down backend is not an expired session; bouncing to /login would hide
  // the real problem behind a sign-in screen that cannot work either.
  if (session.status === 'api-unavailable') {
    return <ApiUnavailable detail={session.detail} />;
  }

  // Server-side gate. The backend independently rejects unauthorised calls:
  // this only avoids rendering a shell the user cannot use.
  if (session.status === 'anonymous') redirect('/login');

  const user = session.user;

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
