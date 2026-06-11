// Lightweight placeholder shown while a lazily-loaded Recharts chart chunk
// resolves. Kept dependency-free so it stays in the eager bundle.
export function ChartFallback({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]"
      style={{ height }}
      aria-hidden="true"
    />
  );
}
