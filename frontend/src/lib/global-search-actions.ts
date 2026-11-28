'use server';

import { apiFetch, ApiError, queryString } from './api';

export type SearchResultType =
  | 'vendor'
  | 'brand'
  | 'product'
  | 'customer'
  | 'enquiry'
  | 'quotation'
  | 'proforma'
  | 'invoice'
  | 'payment'
  | 'delivery'
  | 'user';

export interface SearchHit {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
}

/** Records matching the term across every module the signed-in user may read. */
export async function globalSearchAction(term: string): Promise<{ results: SearchHit[]; error?: string }> {
  const q = term.trim().slice(0, 100);
  if (q.length < 2) return { results: [] };
  try {
    const data = await apiFetch<{ results: SearchHit[] }>(`/search${queryString({ q })}`);
    return { results: data.results };
  } catch (error) {
    return { results: [], error: error instanceof ApiError ? error.messages[0] : 'Search is unavailable right now.' };
  }
}
