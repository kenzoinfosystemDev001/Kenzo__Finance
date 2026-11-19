import Link from 'next/link';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Developer instructions belong on a developer's machine, not on a live site. */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** True when the deployed site was built without the API URL configured. */
const IS_MISCONFIGURED =
  IS_PRODUCTION && !process.env.NEXT_PUBLIC_API_URL;

/**
 * Shown when the Next server cannot reach the NestJS API.
 *
 * This is an operational state, not a crash: the page says what is wrong and
 * what to do about it, instead of surfacing a "fetch failed" stack.
 *
 * The message differs by environment on purpose. A visitor to the deployed
 * site cannot run `npm run api:dev`, and telling them to is both confusing and
 * a small leak of how the system is run; a free backend instance that has gone
 * to sleep simply needs another minute.
 */
export function ApiUnavailable({ detail }: { detail?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-ink">
            {IS_PRODUCTION
              ? 'The service is temporarily unavailable'
              : 'The API server is not responding'}
          </h1>

          {IS_PRODUCTION ? (
            <ProductionBody />
          ) : (
            <DevelopmentBody />
          )}

          <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
            <Link href="/login" className="btn-primary">
              Try again
            </Link>
            <Link href="/" className="btn-secondary">
              Back to home
            </Link>
          </div>

          {detail && !IS_PRODUCTION && (
            <p className="mt-4 border-t border-border pt-3 font-mono text-xs text-ink-subtle">
              {detail}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

function ProductionBody() {
  return (
    <>
      <p className="mt-2 text-base text-ink-muted">
        We cannot reach the application server right now, so signing in is
        unavailable for a moment. Your data is unaffected.
      </p>

      {IS_MISCONFIGURED ? (
        // Worth naming explicitly: this exact symptom is a deploy that was
        // built without NEXT_PUBLIC_API_URL, so the site is calling localhost.
        <p className="mt-4 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
          This deployment has no backend address configured. An administrator
          needs to set <code className="font-mono">NEXT_PUBLIC_API_URL</code> in
          the hosting environment and redeploy.
        </p>
      ) : (
        <ul className="mt-5 list-inside list-disc space-y-1.5 text-sm text-ink-muted">
          <li>
            The server may be waking from idle — this can take up to a minute on
            the first request.
          </li>
          <li>Wait a moment and try again.</li>
          <li>
            If it persists, contact your administrator and mention that the API
            is unreachable.
          </li>
        </ul>
      )}
    </>
  );
}

function DevelopmentBody() {
  return (
    <>
      <p className="mt-2 text-base text-ink-muted">
        The web application is running, but it cannot reach the backend at{' '}
        <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-sm">
          {API_URL}
        </code>
        .
      </p>

      <div className="mt-5 rounded-md border border-border bg-surface-muted p-4">
        <p className="text-sm font-medium text-ink">Start the API</p>
        <pre className="mt-2 overflow-x-auto rounded bg-surface px-3 py-2 font-mono text-sm text-ink">
npm run api:dev</pre>
        <p className="mt-3 text-sm text-ink-muted">
          Or start both applications together:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-surface px-3 py-2 font-mono text-sm text-ink">
npm run dev</pre>
      </div>

      <ul className="mt-5 list-inside list-disc space-y-1 text-sm text-ink-muted">
        <li>
          Check it is up:{' '}
          <code className="font-mono text-xs">{API_URL}/health/ready</code>
        </li>
        <li>
          If the API exits on start, confirm{' '}
          <code className="font-mono text-xs">.env</code> has{' '}
          <code className="font-mono text-xs">DATABASE_URL</code> and both auth
          secrets.
        </li>
        <li>Reload this page once the API reports ready.</li>
      </ul>
    </>
  );
}
