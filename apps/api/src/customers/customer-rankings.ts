/**
 * Top Customers rules. Pure helpers only; the ranking itself is a database
 * query over issued final invoices (see CustomerRankingsService).
 */

export const RANKING_VIEWS = ['all', 'top', 'favourite'] as const;
export type RankingView = (typeof RANKING_VIEWS)[number];

export const RANKING_SORTS = ['invoiced', 'purchases', 'orders'] as const;
export type RankingSort = (typeof RANKING_SORTS)[number];

/**
 * ORDER BY fragment for each sort, from a fixed list. The value is never taken
 * from the request, so it is safe to place into SQL text.
 * Ties fall back to name and then id, so pages never shuffle between requests.
 */
export function rankingOrderBy(sortBy: RankingSort, sortDir: 'asc' | 'desc'): string {
  const column = sortBy === 'invoiced' ? 'invoiced' : sortBy === 'purchases' ? 'units' : 'orders';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  return `${column} ${dir}, name ASC, id ASC`;
}

/** A customer with no issued invoices can never be a top customer. */
export function isRankable(orders: number): boolean {
  return orders > 0;
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Money as a fixed two-decimal string, never a float. */
export function moneyString(value: { toFixed(digits: number): string } | number | string | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  if (typeof value === 'object') return value.toFixed(2);
  return Number(value).toFixed(2);
}
