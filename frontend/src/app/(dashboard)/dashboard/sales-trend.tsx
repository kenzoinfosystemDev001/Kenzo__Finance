import { LineChart, type ChartDatum } from '@/components/analytics-charts';

export interface SalesTrendRow {
  bucket: string;
  currency: string;
  count: number;
  total: string;
}

/** "2026-11" -> "Nov 26". The bucket is a calendar month, so UTC avoids any shift. */
function monthLabel(bucket: string): string {
  const date = new Date(`${bucket}-01T00:00:00Z`);
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/**
 * Invoiced sales by month for one currency (the first in the response, so the
 * chart never mixes currencies). Values are the API's own totals.
 */
export function SalesTrendChart({ rows, currency }: { rows: SalesTrendRow[]; currency: string | null }) {
  const series = rows
    .filter((r) => r.currency === currency)
    .map<ChartDatum>((r) => ({
      label: monthLabel(r.bucket),
      value: Number(r.total),
      display: `${r.currency} ${Number(r.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    }));

  return (
    <LineChart
      series={[{ name: 'Invoiced sales', tone: 'accent', values: series }]}
      empty="No final invoices were issued in this period."
    />
  );
}
