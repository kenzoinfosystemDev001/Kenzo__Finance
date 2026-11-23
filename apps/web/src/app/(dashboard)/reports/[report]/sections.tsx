import type React from 'react';
import { count, humanize, money, type SectionReport } from '@/lib/analytics';
import { DataTable, DefinitionsPanel, Notice, Restricted, Section, Tile } from '../_components/report-ui';

/**
 * Report bodies. Every section renders the report object exactly as the API
 * returns it: scalar figures become tiles, lists of rows become tables, money
 * stays per currency (decimal strings formatted, never re-calculated), and the
 * API's own metric definitions are shown underneath. A figure the API withheld
 * (null - no analytics.financial permission) is shown as "Restricted", never 0.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMoney = (v: unknown): v is { currency: string; total: string } => isObj(v) && typeof v.currency === 'string' && typeof v.total === 'string';
const SKIP = new Set(['definitions', 'period', 'id']);
const ID_KEY = /(^|\.)id$/i;

function cell(key: string, value: Json, row?: Obj): React.ReactNode {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return count(value);
  if (typeof value === 'string') {
    const currency = row && typeof row.currency === 'string' ? row.currency : null;
    if (currency && /^-?\d+\.\d{2}$/.test(value) && key !== 'currency') return money(value, currency);
    return /^[A-Z_]{3,}$/.test(value) && !currency ? humanize(value) : value;
  }
  if (Array.isArray(value)) return value.map((v) => (isMoney(v) ? money(v.total, v.currency) : isObj(v) ? Object.values(v).join(' ') : String(v))).join(', ');
  if (isMoney(value)) return money(value.total, value.currency);
  if (isObj(value)) return (value.name ?? value.invoiceNumber ?? value.number ?? Object.values(value).filter((v) => typeof v !== 'object').join(' ')) as string;
  return String(value);
}

function flatten(row: Obj, prefix = '', out: Record<string, Json> = {}): Record<string, Json> {
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v) && !isMoney(v) && !('name' in v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function RowsTable({ title, rows }: { title: string; rows: Json[] }) {
  if (rows.length && rows.every(isMoney)) {
    return (
      <Section title={title}>
        <DataTable columns={[{ header: 'Currency' }, { header: 'Amount', align: 'right' }]} rows={(rows as Array<{ currency: string; total: string }>).map((m) => ({ key: m.currency, cells: [m.currency, money(m.total, m.currency)] }))} />
      </Section>
    );
  }
  const objects = rows.filter(isObj);
  const flat = objects.map((r) => flatten(r));
  const columns = [...new Set(flat.flatMap((r) => Object.keys(r)))].filter((c) => !ID_KEY.test(c));
  return (
    <Section title={title} padded={false}>
      <DataTable
        columns={columns.map((c) => ({ header: humanize(c.replace(/\./g, ' ')), align: flat.some((r) => typeof r[c] === 'number') ? ('right' as const) : undefined }))}
        rows={flat.map((r, i) => ({ key: String(objects[i].id ?? i), cells: columns.map((c) => cell(c, r[c], objects[i])) }))}
      />
    </Section>
  );
}

function GenericReport({ data }: { data: Obj }) {
  const tiles: React.ReactNode[] = [];
  const tables: React.ReactNode[] = [];
  const walk = (value: Json, path: string) => {
    const label = humanize(path.split('.').pop() ?? path);
    if (Array.isArray(value)) {
      if (value.length && value.every((v) => typeof v !== 'object')) tiles.push(<Tile key={path} label={label} value={value.join(', ')} />);
      else if (value.length && value.every(isMoney) && value.length <= 4) tiles.push(<Tile key={path} label={label} value={(value as Array<{ currency: string; total: string }>).map((m) => money(m.total, m.currency)).join(' · ')} />);
      else tables.push(<RowsTable key={path} title={humanize(path.replace(/\./g, ' '))} rows={value} />);
      return;
    }
    if (isMoney(value)) {
      tiles.push(<Tile key={path} label={label} value={money(value.total, value.currency)} />);
      return;
    }
    if (isObj(value)) {
      for (const [k, v] of Object.entries(value)) if (!SKIP.has(k)) walk(v, path ? `${path}.${k}` : k);
      return;
    }
    tiles.push(<Tile key={path} label={label} value={value === null ? <Restricted /> : cell(path, value)} />);
  };
  for (const [k, v] of Object.entries(data)) if (!SKIP.has(k)) walk(v, k);
  return (
    <div className="space-y-6">
      {tiles.length > 0 && <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{tiles}</div>}
      {tables}
      <DefinitionsPanel definitions={(data.definitions as Record<string, string> | undefined) ?? null} />
    </div>
  );
}

type Body = (props: { data: Obj; permissions: string[] }) => React.ReactNode;
const generic: Body = ({ data }) => <GenericReport data={data} />;
const withNotice =
  (text: string): Body =>
  ({ data }) => (
    <div className="space-y-6">
      <Notice>{text}</Notice>
      <GenericReport data={data} />
    </div>
  );

export const REPORT_BODIES: Record<SectionReport, Body> = {
  sales: generic,
  customers: generic,
  vendors: generic,
  products: generic,
  enquiries: generic,
  quotations: generic,
  proforma: withNotice('Proforma invoice values are not revenue. Revenue is counted from issued final invoices only.'),
  invoices: generic,
  payments: withNotice('Only verified payments count as received. Pending, rejected and reversed payments are excluded.'),
  deliveries: withNotice('Dispatched quantities are not delivered quantities. Delivered figures come only from confirmed deliveries.'),
};

export const REPORT_DESCRIPTIONS: Record<SectionReport, string> = {
  sales: 'Invoiced sales from issued final invoices, per currency.',
  customers: 'Customer activity, invoicing and receivables.',
  vendors: 'Vendor records and the products they supply.',
  products: 'Product demand across quotations and invoices.',
  enquiries: 'Enquiry volume, sources, status and conversion.',
  quotations: 'Quotation volume, value and outcomes.',
  proforma: 'Proforma invoices raised and their status.',
  invoices: 'Final invoices, outstanding balances and ageing.',
  payments: 'Payments recorded, verified collections and methods.',
  deliveries: 'Delivery volume, timeliness and completion.',
};
