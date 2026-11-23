import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth-actions';
import { getAppearanceConfig, getLoginBranding, loginBackgroundUrl } from '@/lib/branding';
import { appearanceImageUrl } from '@/lib/appearance-types';
import { PageHeader, SectionCard } from '@/components/ui';
import { AppearanceImageCard, SupportEmailForm } from './appearance-cards';

export const metadata: Metadata = { title: 'Appearance' };

/**
 * Admin -> Appearance. The one place that controls the look of the sign-in
 * page, the sidebar and the main workspace. Each image is independent.
 */
export default async function AppearancePage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Appearance" />
        <SectionCard title="Access denied" description="Appearance is managed by administrators only.">
          <p className="text-sm text-ink-muted">Ask an administrator if you need a change to the application&apos;s look.</p>
        </SectionCard>
      </div>
    );
  }

  const [appearance, login] = await Promise.all([getAppearanceConfig(), getLoginBranding()]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Appearance"
      />

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
            defaultDescription="The plain slate panel is shown."
            defaultSwatchClass="bg-sidebar"
            summary={appearance?.login ?? null}
            currentUrl={login.backgroundId ? loginBackgroundUrl(login.backgroundId) : null}
            footer={<SupportEmailForm supportEmail={login.supportEmail} canManage={canManage} />}
          />
        </div>

        <AppearanceImageCard
          kind="sidebar"
          title="Sidebar background"
          defaultDescription="The default slate colour is used."
          defaultSwatchClass="bg-sidebar"
          summary={appearance?.sidebar ?? null}
          currentUrl={appearance?.sidebar ? appearanceImageUrl('sidebar', appearance.sidebar.documentId) : null}
        />

        <AppearanceImageCard
          kind="workspace"
          title="Main workspace background"
          defaultDescription="The default off-white is used."
          defaultSwatchClass="bg-canvas"
          summary={appearance?.workspace ?? null}
          currentUrl={appearance?.workspace ? appearanceImageUrl('workspace', appearance.workspace.documentId) : null}
        />
      </div>
    </div>
  );
}
