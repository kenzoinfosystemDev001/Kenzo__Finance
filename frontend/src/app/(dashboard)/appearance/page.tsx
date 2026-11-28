import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth-actions';
import { getAppearanceConfig, loginBackgroundUrl } from '@/lib/branding';
import { appearanceImageUrl } from '@/lib/appearance-types';
import { EmptyState, PageHeader } from '@/components/ui';
import { AppearanceImageCard } from './appearance-cards';

export const metadata: Metadata = { title: 'Appearance' };

/**
 * Admin -> Appearance. Background images for the sign-in page, the sidebar
 * and the main workspace. Each image is independent and optional; without
 * one, the surface keeps its solid default colour. The Kenzo logo is not
 * configurable here by design.
 */
export default async function AppearancePage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Appearance" />
        <EmptyState title="Administrators only" description="Appearance is managed by administrators. Ask one if you need a change." />
      </div>
    );
  }

  const appearance = await getAppearanceConfig();

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Appearance" />

      {!appearance && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm text-warning">
          The current appearance could not be loaded. Showing defaults; try again in a moment before making changes.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <div className="2xl:col-span-2">
          <AppearanceImageCard
            kind="login"
            title="Login page background"
            defaultDescription="The solid sidebar colour is shown."
            defaultSwatchClass="bg-sidebar"
            defaultLabelClass="text-sidebar-ink"
            overlayClass="bg-sidebar/85"
            summary={appearance?.login ?? null}
            currentUrl={appearance?.login ? loginBackgroundUrl(appearance.login.documentId) : null}
          />
        </div>

        <AppearanceImageCard
          kind="sidebar"
          title="Sidebar background"
          defaultDescription="The solid sidebar colour is used."
          defaultSwatchClass="bg-sidebar"
          defaultLabelClass="text-sidebar-ink"
          overlayClass="bg-sidebar/85"
          summary={appearance?.sidebar ?? null}
          currentUrl={appearance?.sidebar ? appearanceImageUrl('sidebar', appearance.sidebar.documentId) : null}
        />

        <AppearanceImageCard
          kind="workspace"
          title="Main workspace background"
          defaultDescription="The solid workspace colour is used."
          defaultSwatchClass="bg-canvas"
          defaultLabelClass="text-ink-muted"
          overlayClass="bg-canvas/85"
          summary={appearance?.workspace ?? null}
          currentUrl={appearance?.workspace ? appearanceImageUrl('workspace', appearance.workspace.documentId) : null}
        />
      </div>
    </div>
  );
}
