export function ConfidenceBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const tone =
    pct >= 0.72
      ? "var(--bp-color-good)"
      : pct >= 0.45
        ? "var(--bp-color-warn)"
        : "var(--bp-color-bad)";
  return (
    <meter
      className="block h-1.5 w-full overflow-hidden rounded-[3px] bg-[var(--bp-color-ink-10)]"
      style={{ accentColor: tone }}
      value={value}
      min={0}
      max={max}
    />
  );
}
