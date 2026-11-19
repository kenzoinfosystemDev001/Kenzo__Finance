const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Shown when the Next server cannot reach the NestJS API.
 *
 * This is an operational state, not a crash: the page says which process is
 * missing and how to start it, instead of surfacing a "fetch failed" stack.
 */
export function ApiUnavailable({ detail }: { detail?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-ink">
            The API server is not responding
          </h1>

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
              If the API exits on start, confirm <code className="font-mono text-xs">.env</code>{' '}
              has <code className="font-mono text-xs">DATABASE_URL</code> and both auth secrets.
            </li>
            <li>Reload this page once the API reports ready.</li>
          </ul>

          {detail && (
            <p className="mt-4 border-t border-border pt-3 font-mono text-xs text-ink-subtle">
              {detail}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
