/**
 * Date ranges offered on the dashboard. Each maps to a preset the analytics
 * and top-seller APIs already accept, so the figures come from the same
 * definitions as the reports.
 */

export const DASHBOARD_RANGES = [
  { preset: 'last7', label: 'Last 7 days' },
  { preset: 'last30', label: 'Last 30 days' },
  { preset: 'thisQuarter', label: 'This quarter' },
  { preset: 'thisYear', label: 'This year' },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]['preset'];

export const DEFAULT_RANGE: DashboardRange = 'last30';

export function parseRange(value: string | undefined): DashboardRange {
  return DASHBOARD_RANGES.some((r) => r.preset === value) ? (value as DashboardRange) : DEFAULT_RANGE;
}
