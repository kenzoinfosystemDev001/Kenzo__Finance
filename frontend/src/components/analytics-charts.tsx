/**
 * Dependency-free charts for Reports & Analytics (server-renderable).
 *
 * Values arrive from the API; money arrives as decimal strings. Bar length and
 * line height need a number, so `value` is used for geometry only - every
 * label and tooltip shows the caller's `display` text (the API value as
 * formatted), never a recomputed figure. Each chart takes ONE unit (one
 * currency or a plain count); callers draw one chart per currency.
 */

export interface ChartDatum {
  label: string;
  /** Used for bar length / point height only. */
  value: number;
  /** Text shown for the value (formatted API figure). */
  display: string;
}

/** Parses an API decimal string for chart geometry only. */
export const geometry = (v: string | number | null | undefined) => {
  const x = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Horizontal bars: categories (status, customer, method...) with values. */
export function BarList({ data, title, empty = 'No data for this selection.' }: { data: ChartDatum[]; title?: string; empty?: string }) {
  if (data.length === 0) return <p className="px-1 py-4 text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <figure className="space-y-2">
      {title && <figcaption className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</figcaption>}
      <ul className="space-y-1.5">
        {data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${d.label}: ${d.display}`}>
            <span className="truncate text-ink-muted">{d.label}</span>
            <span className="h-2.5 rounded-full bg-surface-muted" aria-hidden>
              <span className="block h-2.5 rounded-full bg-accent" style={{ width: `${max > 0 ? Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0) : 0}%` }} />
            </span>
            <span className="whitespace-nowrap text-right font-medium tabular-nums text-ink">{d.display}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const W = 640;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 28, left: 12 };

/** Vertical columns over time buckets (one series). */
export function ColumnChart({ data, title, empty = 'No data for this selection.' }: { data: ChartDatum[]; title?: string; empty?: string }) {
  if (data.length === 0) return <p className="px-1 py-4 text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value), 0);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(Math.min(slot - 2, 40), 2);
  const labelEvery = Math.ceil(data.length / 12);
  return (
    <figure className="space-y-2">
      {title && <figcaption className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title ?? 'Column chart'}>
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="stroke-border" strokeWidth={1} />
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * plotH : 0;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          return (
            <g key={`${d.label}-${i}`}>
              <title>{`${d.label}: ${d.display}`}</title>
              {/* Hit target taller than the mark. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && <rect x={x} y={y} width={barW} height={h} rx={Math.min(4, barW / 2)} className="fill-accent" />}
              {i % labelEvery === 0 && (
                <text x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-ink-subtle" fontSize={11}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export interface LineSeries {
  name: string;
  /** Tailwind stroke/fill class pair, e.g. ['stroke-accent', 'fill-accent']. */
  tone: 'accent' | 'success';
  values: ChartDatum[];
}

const TONE = { accent: ['stroke-chart-primary', 'fill-chart-primary', 'bg-chart-primary'], success: ['stroke-success', 'fill-success', 'bg-success'] } as const;

/** Line chart over shared buckets; one or two series of the same unit. */
export function LineChart({ series, title, empty = 'No data for this selection.' }: { series: LineSeries[]; title?: string; empty?: string }) {
  const buckets = series[0]?.values.map((v) => v.label) ?? [];
  if (buckets.length === 0) return <p className="px-1 py-4 text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...series.flatMap((s) => s.values.map((v) => v.value)), 0);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (buckets.length === 1 ? plotW / 2 : (i / (buckets.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (max > 0 ? (v / max) * plotH : 0);
  const labelEvery = Math.ceil(buckets.length / 12);
  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title && <figcaption className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</figcaption>}
        {series.length > 1 && (
          <ul className="flex flex-wrap gap-3 text-xs text-ink-muted" aria-label="Legend">
            {series.map((s) => (
              <li key={s.name} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2 w-3 rounded-sm ${TONE[s.tone][2]}`} aria-hidden />
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title ?? 'Line chart'}>
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="stroke-border" strokeWidth={1} />
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v.value)}`).join(' ')} fill="none" className={TONE[s.tone][0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <g key={i}>
                <title>{`${s.name} - ${v.label}: ${v.display}`}</title>
                <circle cx={x(i)} cy={y(v.value)} r={10} fill="transparent" />
                <circle cx={x(i)} cy={y(v.value)} r={3.5} className={`${TONE[s.tone][1]} stroke-surface`} strokeWidth={2} />
              </g>
            ))}
          </g>
        ))}
        {buckets.map((b, i) =>
          i % labelEvery === 0 ? (
            <text key={b + i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-subtle" fontSize={11}>
              {b}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
