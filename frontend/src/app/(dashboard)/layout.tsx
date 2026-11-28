import { redirect } from 'next/navigation';
import { getSession, logoutAction } from '@/lib/auth-actions';
import { ApiUnavailable } from '@/components/api-unavailable';
import { Sidebar } from '@/components/sidebar';
import { SidebarProvider } from '@/components/sidebar-context';
import { AppHeader } from '@/components/app-header';
import { BackgroundImage } from '@/components/background-image';
import { getAppearanceConfig } from '@/lib/branding';
import { appearanceImageUrl } from '@/lib/appearance-types';
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

  // Admin-chosen background images (Admin -> Appearance). A failed lookup
  // falls back to the solid default colours. Independent lookups run together.
  // Payment due alerts are shown to anyone who can read invoices.
  const [appearance, paymentAlerts] = await Promise.all([
    getAppearanceConfig(),
    user.permissions.includes('invoice.read') ? getPaymentAlerts() : Promise.resolve(null),
  ]);
  const sidebarUrl = appearance?.sidebar ? appearanceImageUrl('sidebar', appearance.sidebar.documentId) : null;
  const workspaceUrl = appearance?.workspace ? appearanceImageUrl('workspace', appearance.workspace.documentId) : null;

  // The real signed-in user, from the session (photo is stored in the database).
  const accountUser = { id: user.id, fullName: user.fullName, email: user.email, roles: user.roles, photoVersion: user.photoVersion };

  return (
    <SidebarProvider>
    <div className="flex min-h-screen">
      <Sidebar permissions={user.permissions} user={accountUser} logoutAction={logoutAction} backgroundUrl={sidebarUrl} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Fixed behind the content, so it stays put while the page scrolls. A
            solid workspace-colour tint keeps text readable; cards stay white. */}
        <BackgroundImage src={workspaceUrl} overlayClassName="bg-canvas/85" className="fixed inset-0 -z-10" />

        <AppHeader
          user={accountUser}
          canSearchVendors={user.permissions.includes('vendor.read')}
          logoutAction={logoutAction}
          alerts={paymentAlerts}
        />

        <main className="relative flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
    </SidebarProvider>
  );
}
