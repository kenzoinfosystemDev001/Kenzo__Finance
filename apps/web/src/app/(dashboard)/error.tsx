'use client';

import { useEffect } from 'react';

export default function DashboardError({
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
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-base text-ink-muted">
        The page could not be loaded. If this keeps happening, report it with the
        reference below.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-subtle">
          Reference: {error.digest}
        </p>
      )}
      <button type="button" onClick={reset} className="btn-primary mt-6">
        Try again
      </button>
    </div>
  );
}
