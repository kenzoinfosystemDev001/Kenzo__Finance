import 'server-only';
import {
  canWriteSessionCookies,
  getAccessToken,
  getRefreshToken,
  setSessionCookies,
} from './session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Synthetic status used when the API cannot be reached at all. */
export const API_UNAVAILABLE_STATUS = 503;

/**
 * How long to wait for the API before calling it unreachable.
 *
 * Deliberately shorter than a serverless host's own request limit. Without a
 * timeout, a sleeping backend (a free Render instance can take ~50s to wake)
 * holds the render open until the platform kills the function, and the visitor
 * gets the host's raw 504 instead of our own page. Failing first lets us say
 * what is happening and offer a retry.
 */
const REQUEST_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 8000);

/** Uploads legitimately take longer than a page render, so they get their own. */
const UPLOAD_TIMEOUT_MS = Number(process.env.API_UPLOAD_TIMEOUT_MS ?? 60000);

/**
 * Statuses a proxy returns on the API's behalf when it has no answer to pass
 * on. Our own API never produces these, so they always mean the backend is
 * unreachable rather than refusing. 500 is deliberately absent: that is our
 * API failing, and it should surface as a real error.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

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
      signal: AbortSignal.timeout(
        options.formData ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
      ),
      // ERP data is transactional: never serve a cached list after a write.
      cache: 'no-store',
      next: options.tags ? { tags: options.tags } : undefined,
    });
  } catch (cause) {
    // A connection failure is not a bug in the page. Turn Node's bare
    // "fetch failed" into something that names the actual problem, so the UI
    // can tell the user the API is unreachable instead of showing a stack.
    const timedOut =
      cause instanceof Error &&
      (cause.name === 'TimeoutError' || cause.name === 'AbortError');

    throw new ApiError(API_UNAVAILABLE_STATUS, {
      statusCode: API_UNAVAILABLE_STATUS,
      error: 'API_UNAVAILABLE',
      message: timedOut
        ? `The API at ${API_URL} did not respond in time.`
        : `Could not reach the API at ${API_URL}.`,
      details: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    // A gateway status does not come from our API - it comes from whatever
    // sits in front of it reporting that it could not get an answer: the
    // service is deploying, restart-looping or asleep. Treating it as an
    // ordinary API error made the Next server throw, which a visitor sees as
    // a blank "Application error" page instead of our own retry screen.
    if (GATEWAY_STATUSES.has(response.status)) {
      throw new ApiError(API_UNAVAILABLE_STATUS, {
        statusCode: API_UNAVAILABLE_STATUS,
        error: 'API_UNAVAILABLE',
        message: `The API at ${API_URL} is not currently serving requests.`,
        details: `Upstream returned HTTP ${response.status}.`,
      });
    }

    const body: ApiErrorBody = contentType.includes('application/json')
      ? await response.json()
      : {
          statusCode: response.status,
          error: response.statusText,
          // A non-JSON error body is an error page from the platform, not a
          // message for the user. Keep enough to identify it, not all of it.
          message: truncate(await response.text(), 300),
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
  // During a page render the middleware has already renewed the session; a
  // second rotation here could not be saved (see canWriteSessionCookies).
  if (!(await canWriteSessionCookies())) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
