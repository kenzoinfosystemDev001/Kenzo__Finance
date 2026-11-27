/** Shown while the dashboard figures load. Same layout as the page, so nothing jumps when they arrive. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-4">
      <div className="h-10 w-72 rounded-md bg-surface-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-28 bg-surface-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="card h-80 bg-surface-muted xl:col-span-2" />
        <div className="card h-80 bg-surface-muted xl:col-span-3" />
      </div>
      <div className="card h-64 bg-surface-muted" />
    </div>
  );
}
