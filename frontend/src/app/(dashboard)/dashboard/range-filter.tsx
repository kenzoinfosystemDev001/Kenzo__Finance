import Link from 'next/link';
import { DASHBOARD_RANGES, type DashboardRange } from './dashboard-range';

/** Server-rendered range selector: each option is a link, so it needs no client state. */
export function RangeFilter({ current }: { current: DashboardRange }) {
  return (
    <nav aria-label="Date range" className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-1">
      {DASHBOARD_RANGES.map((option) => {
        const selected = option.preset === current;
        return (
          <Link
            key={option.preset}
            href={`/dashboard?range=${option.preset}`}
            aria-current={selected ? 'true' : undefined}
            className={
              selected
                ? 'rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted hover:text-ink'
            }
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
