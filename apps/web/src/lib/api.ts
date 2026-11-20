import 'server-only';
import { canWriteCookies, getAccessToken, getRefreshToken, setSessionCookies } from './session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Synthetic status used when the API cannot be reached at all. */
export const API_UNAVAILABLE_STATUS = 503;

/** True when the API server is down/unreachable, rather than returning an error. */
export function isApiUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === API_UNAVAILABLE_STATUS &&
    error.body.error === 'API_UNAVAILABLE'
  );
}

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
 * On a 401 it attempts one silent token refresh and retries once.
 *
 * It never redirects. Redirecting from the data layer caused the login page -
 * which asks for the current user to decide whether to skip the form - to
 * bounce to itself forever. Deciding what an unauthenticated request means is
 * the caller's job: `getCurrentUser()` turns it into null, and the dashboard
 * layout redirects to /login.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await rawFetch(path, options);

  if (response.status === 401 && !options.noRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return handleResponse<T>(await rawFetch(path, options));
    }
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

  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      // ERP data is transactional: never serve a cached list after a write.
      cache: 'no-store',
      next: options.tags ? { tags: options.tags } : undefined,
    });
  } catch (cause) {
    // A connection failure is not a bug in the page. Turn Node's bare
    // "fetch failed" into something that names the actual problem, so the UI
    // can tell the user the API is not running instead of showing a stack.
    throw new ApiError(API_UNAVAILABLE_STATUS, {
      statusCode: API_UNAVAILABLE_STATUS,
      error: 'API_UNAVAILABLE',
      message:
        `Could not reach the API at ${API_URL}. ` +
        'Start it with "npm run api:dev" (or "npm run dev" for both apps).',
      details: cause instanceof Error ? cause.message : String(cause),
    });
  }
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

  // Refresh tokens are single-use. Rotating one where the new pair cannot be
  // stored (a Server Component render) would leave the browser holding a
  // revoked token. src/middleware.ts renews sessions before rendering, so
  // here a refresh only happens where the cookies can actually be updated.
  if (!(await canWriteCookies())) return false;

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
