import Link from 'next/link';
import clsx from 'clsx';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-base text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-lg font-medium text-ink">{title}</p>
      <p className="mt-1.5 max-w-md text-base text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  correlationId,
}: {
  title?: string;
  message: string;
  correlationId?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-subtle p-4"
    >
      <p className="text-base font-medium text-danger">{title}</p>
      <p className="mt-1 text-sm text-danger/90">{message}</p>
      {correlationId && (
        <p className="mt-2 font-mono text-xs text-danger/70">
          Reference: {correlationId}
        </p>
      )}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  accent: 'bg-accent-subtle text-accent',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: Tone;
}) {
  return <span className={clsx('badge', TONE_CLASS[tone])}>{children}</span>;
}

export function VendorStatusBadge({
  status,
  archivedAt,
}: {
  status: string;
  archivedAt?: string | null;
}) {
  if (archivedAt) return <Badge tone="danger">Archived</Badge>;
  if (status === 'ACTIVE') return <Badge tone="success">Active</Badge>;
  return <Badge tone="neutral">Inactive</Badge>;
}

/** Server-rendered pagination: each control is a plain link, so it works
 *  without client JavaScript and the URL stays shareable. */
export function Pagination({
  meta,
  basePath,
  params,
}: {
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (meta.totalItems === 0) return null;

  const buildHref = (page: number): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set('page', String(page));
    return `${basePath}?${search.toString()}`;
  };

  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-sm text-ink-muted">
        Showing <span className="font-medium text-ink">{first}</span>&ndash;
        <span className="font-medium text-ink">{last}</span> of{' '}
        <span className="font-medium text-ink">{meta.totalItems}</span>
      </p>

      <div className="flex items-center gap-2">
        {meta.hasPreviousPage ? (
          <Link href={buildHref(meta.page - 1)} className="btn-secondary">
            Previous
          </Link>
        ) : (
          <span className="btn-secondary pointer-events-none opacity-50">
            Previous
          </span>
        )}

        <span className="px-1 text-sm text-ink-muted">
          Page {meta.page} of {meta.totalPages}
        </span>

        {meta.hasNextPage ? (
          <Link href={buildHref(meta.page + 1)} className="btn-secondary">
            Next
          </Link>
        ) : (
          <span className="btn-secondary pointer-events-none opacity-50">Next</span>
        )}
      </div>
    </div>
  );
}

export function DefinitionList({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-base text-ink">
            {item.value || <span className="text-ink-subtle">Not provided</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  padded = true,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}
