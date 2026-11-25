import Link from 'next/link';
import clsx from 'clsx';
import { IconChevronLeft, IconChevronRight } from './icons';

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
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-lg font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-base text-ink-muted">{description}</p>}
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
  const [label, tone] = archivedAt
    ? (['Archived', 'neutral'] as const)
    : status === 'ACTIVE'
      ? (['Active', 'success'] as const)
      : (['Inactive', 'danger'] as const);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tone === 'success' && 'border-success/25 bg-success-subtle text-success',
        tone === 'danger' && 'border-danger/25 bg-danger-subtle text-danger',
        tone === 'neutral' && 'border-border bg-surface-muted text-ink-muted',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          tone === 'success' && 'bg-success',
          tone === 'danger' && 'bg-danger',
          tone === 'neutral' && 'bg-ink-subtle',
        )}
      />
      {label}
    </span>
  );
}

/** KPI tile. `trend` is a real figure supplied by the caller, never decoration. */
export function StatCard({
  label,
  value,
  icon,
  iconClassName,
  note,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconClassName: string;
  note?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div className="flex items-center gap-4">
      <span
        aria-hidden
        className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm', iconClassName)}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-tight text-ink">{value}</p>
        <p className="text-sm font-medium leading-tight text-ink-muted">{label}</p>
        {note && <p className="mt-0.5 truncate text-xs text-ink-subtle">{note}</p>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="card block p-4 transition-shadow hover:shadow-popover">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

/** Link-based tabs: the active tab lives in the URL, so it is shareable. */
export function Tabs({
  tabs,
  active,
}: {
  tabs: Array<{ key: string; label: string; href: string; count?: number }>;
  active: string;
}) {
  return (
    <nav aria-label="Sections" className="-mx-1 overflow-x-auto border-b border-border px-1">
      <ul className="flex gap-6">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link href={tab.href} scroll={false} className="tab-link" aria-current={tab.key === active ? 'page' : undefined}>
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-ink-muted">
                  {tab.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Server-rendered pagination: each control is a plain link, so it works
 *  without client JavaScript and the URL stays shareable. */
export function Pagination({
  meta,
  basePath,
  params,
  noun = 'records',
  extra,
}: {
  noun?: string;
  /** Rendered beside the page links, e.g. a page-size selector. */
  extra?: React.ReactNode;
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

  // 1 ... 4 5 [6] 7 8 ... 20
  const pages: Array<number | 'gap'> = [];
  for (let page = 1; page <= meta.totalPages; page += 1) {
    if (page === 1 || page === meta.totalPages || Math.abs(page - meta.page) <= 1) {
      pages.push(page);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }

  const pageButton = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-sm text-ink-muted">
        Showing <span className="font-medium text-ink">{first}</span>&ndash;
        <span className="font-medium text-ink">{last}</span> of{' '}
        <span className="font-medium text-ink">{meta.totalItems}</span> {noun}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {extra}
        <nav aria-label="Pagination" className="flex items-center gap-1">
          {meta.hasPreviousPage ? (
            <Link href={buildHref(meta.page - 1)} className={clsx(pageButton, 'border-border text-ink hover:bg-surface-muted')} aria-label="Previous page">
              <IconChevronLeft size={16} />
            </Link>
          ) : (
            <span className={clsx(pageButton, 'border-border text-ink-subtle opacity-50')} aria-hidden>
              <IconChevronLeft size={16} />
            </span>
          )}

          {pages.map((page, index) =>
            page === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-ink-subtle" aria-hidden>
                &hellip;
              </span>
            ) : page === meta.page ? (
              <span key={page} aria-current="page" className={clsx(pageButton, 'border-accent bg-accent text-white')}>
                {page}
              </span>
            ) : (
              <Link key={page} href={buildHref(page)} className={clsx(pageButton, 'border-border text-ink hover:bg-surface-muted')}>
                {page}
              </Link>
            ),
          )}

          {meta.hasNextPage ? (
            <Link href={buildHref(meta.page + 1)} className={clsx(pageButton, 'border-border text-ink hover:bg-surface-muted')} aria-label="Next page">
              <IconChevronRight size={16} />
            </Link>
          ) : (
            <span className={clsx(pageButton, 'border-border text-ink-subtle opacity-50')} aria-hidden>
              <IconChevronRight size={16} />
            </span>
          )}
        </nav>
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
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
