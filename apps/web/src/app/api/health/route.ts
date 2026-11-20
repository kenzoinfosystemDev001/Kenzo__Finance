import { NextResponse } from 'next/server';

/**
 * Connectivity check for the deployed frontend.
 *
 * Answers one question that is otherwise awkward to answer: can *this* web
 * deployment reach *that* API? Checking the API's own health endpoint from a
 * laptop proves nothing about what the Vercel server can reach, and a failing
 * page cannot distinguish "wrong URL" from "backend down".
 *
 * Open it in a browser or curl it:
 *   curl https://<your-site>/api/health
 *
 * Everything reported here is already public: the API URL ships to the
 * browser in NEXT_PUBLIC_API_URL. No credential is read or returned.
 */

/**
 * The same fallback every other caller uses, so this reports what the app
 * will actually do rather than a stricter rule of its own. Locally the
 * variable usually is unset - it lives in the repository-root .env, which
 * Next does not read from apps/web - and the fallback is correct there.
 * In a production build it is not: falling back to localhost is the bug.
 */
const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_URL = CONFIGURED_API_URL ?? 'http://localhost:4000/api/v1';
const IS_MISCONFIGURED =
  process.env.NODE_ENV === 'production' && !CONFIGURED_API_URL;
const TIMEOUT_MS = 10000;

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  if (IS_MISCONFIGURED) {
    return NextResponse.json(
      {
        web: 'ok',
        api: 'not-configured',
        apiUrl: null,
        problem:
          'NEXT_PUBLIC_API_URL is not set in this deployment. Set it, then ' +
          'redeploy - it is read when the app is built, not when it runs.',
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${API_URL}/health/ready`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    const latencyMs = Date.now() - startedAt;
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          web: 'ok',
          api: 'unhealthy',
          apiUrl: API_URL,
          httpStatus: response.status,
          latencyMs,
          problem:
            response.status === 404
              ? 'Reached the host but not the API. Check NEXT_PUBLIC_API_URL ends with /api/v1.'
              : 'The API responded but is not healthy. Check its own logs.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      web: 'ok',
      api: 'ok',
      apiUrl: API_URL,
      latencyMs,
      // Proves the API reached PostgreSQL, not merely that it is listening.
      database: body?.database ?? 'unknown',
    });
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      (cause.name === 'TimeoutError' || cause.name === 'AbortError');

    return NextResponse.json(
      {
        web: 'ok',
        api: timedOut ? 'timeout' : 'unreachable',
        apiUrl: API_URL,
        latencyMs: Date.now() - startedAt,
        problem: timedOut
          ? `No response within ${TIMEOUT_MS / 1000}s. A free instance can take ~50s to wake - retry once.`
          : 'Could not open a connection. Check the host name and that the service is running.',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 503 },
    );
  }
}
