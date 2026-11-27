import { redirect } from 'next/navigation';
import { getSession, logoutAction } from '@/lib/auth-actions';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Sidebar } from '@/components/sidebar';
import { AppHeader } from '@/components/app-header';
import { getPaymentAlerts } from '@/lib/payment-alerts';

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

  // Payment due alerts are shown to anyone who can read invoices.
  const paymentAlerts = user.permissions.includes('invoice.read') ? await getPaymentAlerts() : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar permissions={user.permissions} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={{ id: user.id, fullName: user.fullName, email: user.email, roles: user.roles, photoVersion: user.photoVersion }}
          canSearchVendors={user.permissions.includes('vendor.read')}
          logoutAction={logoutAction}
          alerts={paymentAlerts}
        />

        <main className="relative flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
