/** Shown while any vendor screen (list, profile, forms) loads its data. */
export default function VendorsLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-xl bg-surface-muted" />
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-surface-muted" />
          <div className="h-4 w-72 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
      <div className="card space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-9 w-full animate-pulse rounded bg-surface-muted" />
        ))}
      </div>
      <span className="sr-only">Loading...</span>
    </div>
  );
}
