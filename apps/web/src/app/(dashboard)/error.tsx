'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // reset() alone re-renders the cached failed Server Component payload;
  // refresh() refetches it so a recovered API actually shows.
  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

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
      <button type="button" onClick={retry} disabled={retrying} className="btn-primary mt-6">
        {retrying ? 'Retrying...' : 'Try again'}
      </button>
    </div>
  );
}
