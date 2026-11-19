import 'server-only';
import { redirect } from 'next/navigation';
import { getAccessToken, getRefreshToken, setSessionCookies } from './session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Error shape the NestJS exception filter returns. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId?: string;
  duplicates?: unknown;
  requiresConfirmation?: boolean;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(
      Array.isArray(body.message) ? body.message.join('; ') : String(body.message),
    );
    this.name = 'ApiError';
  }

  /** Field-level validation messages, when the API returned a list. */
  get messages(): string[] {
    return Array.isArray(this.body.message)
      ? this.body.message
      : [String(this.body.message)];
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** FormData for multipart uploads; sent instead of `body`. */
  formData?: FormData;
  /** Next cache tags so a mutation can revalidate the affected lists. */
  tags?: string[];
  /** Skip the refresh-and-retry path (used by the refresh call itself). */
  noRetry?: boolean;
}

/**
 * Server-side API client.
 *
 * Runs only on the Next server, so the access token never reaches the browser.
 * On a 401 it attempts one silent refresh before giving up and redirecting to
 * the login page.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await rawFetch(path, options);

  if (response.status === 401 && !options.noRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retry = await rawFetch(path, options);
      return handleResponse<T>(retry);
    }
    redirect('/login?reason=session-expired');
  }

  return handleResponse<T>(response);
}

async function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.formData) {
    // fetch sets the multipart boundary itself; setting it manually breaks it.
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  return fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    // ERP data is transactional: never serve a cached list after a write.
    cache: 'no-store',
    next: options.tags ? { tags: options.tags } : undefined,
  });
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    const body: ApiErrorBody = contentType.includes('application/json')
      ? await response.json()
      : {
          statusCode: response.status,
          error: response.statusText,
          message: await response.text(),
        };
    throw new ApiError(response.status, body);
  }

  if (!contentType.includes('application/json')) {
    return (await response.text()) as T;
  }

  return response.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return false;

    await setSessionCookies(await response.json());
    return true;
  } catch {
    return false;
  }
}

/** Builds a query string, dropping empty values. */
export function queryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const result = search.toString();
  return result ? `?${result}` : '';
}
