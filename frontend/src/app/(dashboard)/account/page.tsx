import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-actions';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import { ThemePicker } from '@/components/theme-picker';
import { actionLabel, groupByModule, humanizeCode, moduleLabel, parsePermissionCodes } from '@/lib/user-labels';
import { DefinitionList, PageHeader, SectionCard } from '@/components/ui';
import { ChangePasswordForm } from './change-password-form';
import { ProfilePhotoControls } from '@/components/profile-photo-controls';

export const metadata: Metadata = { title: 'My account' };

/** Available to every signed-in user; reads the profile from GET /auth/me. */
export default async function AccountPage() {
  const user = await getCurrentUser();
  // The dashboard layout already redirects anonymous visitors; this narrows the type.
  if (!user) redirect('/login');

  const groups = groupByModule(parsePermissionCodes(user.permissions));
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="My account" description="Your profile, your access, and your password." />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Profile photo" description="Shown in the top bar and wherever you appear in the app.">
          <ProfilePhotoControls owner="me" fullName={user.fullName} initialVersion={user.photoVersion ?? null} size="xl" />
          <p className="mt-4 text-xs text-ink-subtle">JPG, PNG or WEBP, up to 2 MB. Your photo is stored with your account.</p>
        </SectionCard>

        <SectionCard title="Profile">
          <DefinitionList
            items={[
              { label: 'Full name', value: user.fullName },
              { label: 'Email (sign-in)', value: user.email },
              {
                label: 'Roles',
                value:
                  user.roles.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {user.roles.map((code) => (
                        <span key={code} className="chip" title={code}>
                          {humanizeCode(code)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    'No roles assigned'
                  ),
              },
            ]}
          />
          <p className="mt-4 text-xs text-ink-subtle">
            Your name, phone and roles are managed by an administrator.
          </p>
        </SectionCard>

        <SectionCard title="Change password" description="Minimum 12 characters.">
          <ChangePasswordForm />
        </SectionCard>

        <SectionCard title="Appearance" description="Light, dark, or follow your device's setting.">
          <ThemePicker initial={theme} />
        </SectionCard>
      </div>

      <SectionCard title="Your permissions" description={`${user.permissions.length} permission(s) from your roles.`}>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-muted">You have no permissions beyond signing in.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <div key={group.module}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{moduleLabel(group.module)}</h3>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {group.items.map((permission) => (
                    <li key={permission.code} className="chip" title={permission.code}>
                      {actionLabel(permission.action)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
