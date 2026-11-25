import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import type { CustomerDetail, EnquiryAssignee, Product } from '@/lib/types';
import {
  canViewReport,
  filterSearch,
  humanize,
  money,
  REPORT_FILTERS,
  REPORT_TITLES,
  reportParams,
  SECTION_REPORTS,
  type AnalyticsFilters,
  type CurrencyTotal,
  type Definitions,
  type ReportKey,
} from '@/lib/analytics';
import { ErrorState, PageHeader } from '@/components/ui';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { IconDownload } from '@/components/icons';
import { ReportFilters } from './report-filters';

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

export type Loaded<T> = { ok: true; data: T } | { ok: false; status: number; message: string; correlationId?: string };

/** Fetches one analytics report with exactly the params the DTO declares. */
export async function loadReport<T>(report: ReportKey, filters: AnalyticsFilters): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(`/analytics/${report}${queryString(reportParams(report, filters))}`) };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, status: error.status, message: error.messages.join(' '), correlationId: error.body.correlationId };
    return { ok: false, status: 500, message: error instanceof Error ? error.message : 'The report could not be loaded.' };
  }
}

export function LoadError({ result, what }: { result: Extract<Loaded<unknown>, { ok: false }>; what: string }) {
  const title = result.status === 403 ? 'Not allowed' : result.status === 400 ? 'Invalid filters' : `Could not load ${what}`;
  return <ErrorState title={title} message={result.message} correlationId={result.correlationId} />;
}

// ---------------------------------------------------------------------------
// Page shell: header, section tabs, filters, export
// ---------------------------------------------------------------------------

export async function ReportShell({
  active,
  permissions,
  filters,
  period,
  description,
  children,
}: {
  active: ReportKey;
  permissions: string[];
  filters: AnalyticsFilters;
  /** Period label from the API response, when loaded. */
  period?: string;
  description?: string;
  children: React.ReactNode;
}) {
  const used = REPORT_FILTERS[active];
  const [customer, product, assignees] = await Promise.all([
    used.includes('customerId') && filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : null,
    used.includes('productId') && filters.productId ? apiFetch<Product>(`/products/${filters.productId}`).catch(() => null) : null,
    used.includes('assignedToId') ? apiFetch<EnquiryAssignee[]>('/enquiries/assignees').catch(() => [] as EnquiryAssignee[]) : ([] as EnquiryAssignee[]),
  ]);

  const search = filterSearch(filters);
  const tabs: Array<{ key: ReportKey; label: string; href: string }> = [
    ...(canViewReport('overview', permissions) ? [{ key: 'overview' as const, label: 'Overview', href: `/reports${search}` }] : []),
    ...SECTION_REPORTS.filter((r) => canViewReport(r, permissions)).map((r) => ({ key: r, label: REPORT_TITLES[r], href: `/reports/${r}${search}` })),
  ];

  const canExport = permissions.includes('analytics.export') && canViewReport(active, permissions);
  const exportHref = (format: 'csv' | 'xlsx' | 'pdf') => `/reports/export${queryString({ report: active, format, ...reportParams(active, filters) })}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={active === 'overview' ? 'Reports & Analytics' : `${REPORT_TITLES[active]} Report`}
        description={[description, period ? `Period: ${period}.` : null].filter(Boolean).join(' ') || undefined}
        actions={
          canExport ? (
            <>
              <a href={exportHref('csv')} className="btn-secondary">
                <IconDownload size={16} /> CSV
              </a>
              <a href={exportHref('xlsx')} className="btn-secondary">
                <IconDownload size={16} /> Excel
              </a>
              <a href={exportHref('pdf')} className="btn-secondary">
                <IconDownload size={16} /> PDF
              </a>
            </>
          ) : undefined
        }
      />

      {tabs.length > 0 && (
        <nav aria-label="Reports" className="-mx-1 overflow-x-auto border-b border-border px-1">
          <ul className="flex gap-5">
            {tabs.map((tab) => (
              <li key={tab.key}>
                <Link href={tab.href} className="tab-link whitespace-nowrap" aria-current={tab.key === active ? 'page' : undefined}>
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <ReportFilters
        filters={used}
        customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null}
        product={product ? { id: product.id, label: product.name, detail: product.productCode } : null}
        assignees={assignees.map((a) => ({ id: a.id, fullName: a.fullName }))}
      />

      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export function Tile({ label, value, note, href }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-0.5 text-sm text-ink-subtle">{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 transition-shadow hover:shadow-popover">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

/** Shown in place of a figure the API withheld (no analytics.financial). */
export function Restricted({ inline = false }: { inline?: boolean }) {
  return inline ? (
    <span className="text-xs font-medium text-ink-subtle" title="Requires the analytics.financial permission">Restricted</span>
  ) : (
    <span className="text-base font-medium text-ink-subtle" title="Requires the analytics.financial permission">Restricted</span>
  );
}

/** One money figure per currency (never summed across currencies). */
export function MoneyTile({
  label,
  items,
  note,
  href,
  showCount = true,
}: {
  label: string;
  /** null = withheld by the API. */
  items: Array<CurrencyTotal & { count?: number }> | null;
  note?: React.ReactNode;
  href?: string;
  showCount?: boolean;
}) {
  const value =
    items === null ? (
      <Restricted />
    ) : items.length === 0 ? (
      <span className="text-base font-medium text-ink-subtle">None in this period</span>
    ) : (
      <span className="block space-y-0.5">
        {items.map((m) => (
          <span key={m.currency} className="block text-xl">
            {money(m.total, m.currency)}
            {showCount && m.count !== undefined && <span className="ml-2 text-xs font-normal text-ink-subtle">({m.count})</span>}
          </span>
        ))}
      </span>
    );
  return <Tile label={label} value={value} note={note} href={href} />;
}

export function Section({ title, description, children, padded = true, actions }: { title: string; description?: string; children: React.ReactNode; padded?: boolean; actions?: React.ReactNode }) {
  return (
    <section className="card min-w-0">
      <PanelHeader title={title} description={description} actions={actions} />
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export interface Column {
  header: string;
  align?: 'right';
}

export function DataTable({ columns, rows, empty = 'Nothing matches the selected period and filters.' }: { columns: Column[]; rows: Array<{ key: string; cells: React.ReactNode[] }>; empty?: string }) {
  if (rows.length === 0) return <EmptyStateClient title="No records" description={empty} />;
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={clsx(c.align === 'right' && 'text-right')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell, i) => (
                <td key={i} className={clsx(columns[i]?.align === 'right' && 'whitespace-nowrap text-right tabular-nums')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The API's own explanation of every figure. */
export function DefinitionsPanel({ definitions }: { definitions?: Definitions | null }) {
  const entries = Object.entries(definitions ?? {});
  if (entries.length === 0) return null;
  return (
    <details className="card group">
      <summary className="cursor-pointer select-none px-5 py-3.5 text-base font-semibold text-ink">How these figures are calculated</summary>
      <dl className="space-y-3 border-t border-border px-5 py-4">
        {entries.map(([key, text]) => (
          <div key={key}>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{humanize(key)}</dt>
            <dd className="mt-0.5 text-sm text-ink">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Highlights one definition the reader must not miss (e.g. PI is not revenue). */
export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-ink">{children}</div>;
}

/** Link to a record page only when the user can open that module. */
export function RecordLink({ href, permission, permissions, children }: { href: string; permission: string; permissions: string[]; children: React.ReactNode }) {
  return permissions.includes(permission) ? (
    <Link href={href} className="font-semibold text-ink hover:text-accent hover:underline">
      {children}
    </Link>
  ) : (
    <span className="font-semibold text-ink">{children}</span>
  );
}

/** Splits rows by currency so each chart has a single unit. */
export function byCurrency<T extends { currency: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(r.currency, [...(map.get(r.currency) ?? []), r]);
  return [...map.entries()];
}
