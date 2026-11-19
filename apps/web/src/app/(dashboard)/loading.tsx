export default function DashboardLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-surface-muted" />
      <div className="card p-4">
        <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
      </div>
      <div className="card p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-surface-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
