export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="animate-pulse space-y-4">
      <div className="h-7 w-64 rounded bg-ink-200" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-ink-100" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-ink-100" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
