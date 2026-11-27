import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth-actions';
import { getLoginBranding } from '@/lib/branding';
import { PageHeader, SectionCard } from '@/components/ui';
import { SupportEmailForm } from './support-email-form';
import { LogoCard } from './logo-card';

export const metadata: Metadata = { title: 'Appearance' };

/** True when an administrator has uploaded a logo (the bundled default otherwise). */
async function hasCustomLogo(): Promise<boolean> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/branding/logo`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Admin -> Appearance: the company logo and the sign-in page contact address.
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

  const login = await getLoginBranding();

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Appearance" />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <div className="2xl:col-span-2">
          <LogoCard hasCustomLogo={await hasCustomLogo()} />
        </div>

        <div className="2xl:col-span-2">
          <SectionCard title="Sign-in page contact" description="Where users are directed for access or password help.">
            <SupportEmailForm supportEmail={login.supportEmail} canManage={canManage} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
