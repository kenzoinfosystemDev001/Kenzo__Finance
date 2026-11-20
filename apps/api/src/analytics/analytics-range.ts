import { BadRequestException } from '@nestjs/common';
import { businessToday } from '../common/utils/business-date';

/**
 * Report periods. All dates are calendar days in the business time zone
 * (BUSINESS_TIMEZONE), inclusive on both ends, matching @db.Date columns.
 */
export const RANGE_PRESETS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'previousMonth', 'thisQuarter', 'thisYear', 'custom', 'all'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface Period {
  preset: RangePreset;
  /** Inclusive start (00:00 UTC of the business day), null = from the beginning. */
  from: Date | null;
  /** Inclusive end (00:00 UTC of the business day). */
  to: Date;
  label: string;
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

export function resolvePeriod(preset: RangePreset = 'thisMonth', dateFrom?: string, dateTo?: string, today: Date = businessToday()): Period {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  let from: Date | null;
  let to = today;
  switch (preset) {
    case 'today':
      from = today;
      break;
    case 'yesterday':
      from = new Date(today.getTime() - DAY);
      to = from;
      break;
    case 'last7':
      from = new Date(today.getTime() - 6 * DAY);
      break;
    case 'last30':
      from = new Date(today.getTime() - 29 * DAY);
      break;
    case 'thisMonth':
      from = utc(y, m, 1);
      break;
    case 'previousMonth':
      from = utc(y, m - 1, 1);
      to = utc(y, m, 0);
      break;
    case 'thisQuarter':
      from = utc(y, Math.floor(m / 3) * 3, 1);
      break;
    case 'thisYear':
      from = utc(y, 0, 1);
      break;
    case 'all':
      from = null;
      break;
    case 'custom': {
      if (!dateFrom || !dateTo) throw new BadRequestException('A custom range needs both dateFrom and dateTo.');
      from = new Date(`${dateFrom.slice(0, 10)}T00:00:00.000Z`);
      to = new Date(`${dateTo.slice(0, 10)}T00:00:00.000Z`);
      if (from > to) throw new BadRequestException('dateFrom must not be after dateTo.');
      break;
    }
    default:
      throw new BadRequestException('Unknown date range.');
  }
  return { preset, from, to, label: from ? (iso(from) === iso(to) ? iso(to) : `${iso(from)} to ${iso(to)}`) : `All dates up to ${iso(to)}` };
}

/** The immediately preceding period of the same length (for comparisons). Null for "all". */
export function previousPeriod(period: Period): Period | null {
  if (!period.from) return null;
  const length = Math.round((period.to.getTime() - period.from.getTime()) / DAY) + 1;
  const to = new Date(period.from.getTime() - DAY);
  const from = new Date(to.getTime() - (length - 1) * DAY);
  return { preset: 'custom', from, to, label: `${iso(from)} to ${iso(to)}` };
}

/** Exclusive upper bound for timestamp columns (end of the last day). */
export const endExclusive = (period: Period) => new Date(period.to.getTime() + DAY);
