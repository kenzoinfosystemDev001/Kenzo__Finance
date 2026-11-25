import clsx from 'clsx';
import { formatDateTime } from '@/lib/vendor-labels';
import type { UserStatus } from '@/lib/types';

/**
 * Account status. A user can be ACTIVE in the database yet temporarily locked
 * out after failed sign-ins (lockedUntil in the future); that shows as Locked.
 */
export function UserStatusBadge({
  status,
  locked,
  lockedUntil,
  showUntil = false,
}: {
  status: UserStatus;
  locked: boolean;
  lockedUntil: string | null;
  showUntil?: boolean;
}) {
  const [label, tone] =
    status === 'INACTIVE'
      ? (['Inactive', 'danger'] as const)
      : status === 'LOCKED' || locked
        ? (['Locked', 'warning'] as const)
        : (['Active', 'success'] as const);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          tone === 'success' && 'border-success/25 bg-success-subtle text-success',
          tone === 'danger' && 'border-danger/25 bg-danger-subtle text-danger',
          tone === 'warning' && 'border-warning/25 bg-warning-subtle text-warning',
        )}
      >
        <span
          aria-hidden
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            tone === 'success' && 'bg-success',
            tone === 'danger' && 'bg-danger',
            tone === 'warning' && 'bg-warning',
          )}
        />
        {label}
      </span>
      {showUntil && label === 'Locked' && lockedUntil && (
        <span className="text-xs text-ink-subtle">until {formatDateTime(lockedUntil)}</span>
      )}
    </span>
  );
}

export function RoleChips({ roles, max }: { roles: Array<{ code: string; name: string }>; max?: number }) {
  if (roles.length === 0) return <span className="text-ink-subtle">&mdash;</span>;
  const shown = max ? roles.slice(0, max) : roles;
  const more = roles.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((role) => (
        <span key={role.code} className="chip" title={role.code}>
          {role.name}
        </span>
      ))}
      {more > 0 && (
        <span className="chip" title={roles.slice(shown.length).map((r) => r.name).join(', ')}>
          +{more}
        </span>
      )}
    </span>
  );
}
