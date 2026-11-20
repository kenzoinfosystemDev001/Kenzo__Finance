'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Catches anything thrown while rendering a page outside the dashboard,
 * which in practice means the sign-in page.
 *
 * Without a boundary here, a throw in a Server Component reaches the hosting
 * platform, which shows a bare "Application error: a server-side exception
 * has occurred" and a digest - no explanation, no way back, and the real
 * message deliberately stripped in production. The digest is the only thread
 * back to the server log, so it is shown rather than hidden.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-ink">
            Something went wrong
          </h1>

          <p className="mt-2 text-base text-ink-muted">
            This page could not be loaded. Your data is unaffected. Try again,
            and if it keeps happening send an administrator the reference
            below.
          </p>

          {error.digest && (
            <p className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-ink-subtle">
              Reference: {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="btn-primary">
              Try again
            </button>
            <Link href="/" className="btn-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
