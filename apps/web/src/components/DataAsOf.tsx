import { freshnessForDataAsOf, type RouteCapabilityFreshness } from "@bp/domain/studio";

/**
 * The one shared freshness label (hard-cutover C4): every data block shows
 * `dataAsOf` + a freshness state from the C1 vocabulary. `generatedAt` (pipeline
 * run time) is never a user-facing data label — it survives only in artifact
 * metadata.
 *
 * Freshness is judged against the current calendar month unless a reference
 * month (e.g. a capability surface's release month) is passed in.
 */

const FRESHNESS_TONE: Record<RouteCapabilityFreshness, { color: string; label: string }> = {
  current: { color: "var(--bp-color-good)", label: "current" },
  recent: { color: "var(--bp-color-warn, #b8860b)", label: "recent" },
  stale: { color: "var(--bp-color-bad, #b3261e)", label: "stale" },
  unknown: { color: "var(--bp-color-ink-55)", label: "unknown" },
};

export function currentIsoMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function DataAsOf({
  dataAsOf,
  referenceMonth,
  className,
}: {
  dataAsOf: string | null | undefined;
  referenceMonth?: string;
  className?: string;
}) {
  const freshness = freshnessForDataAsOf(dataAsOf ?? null, referenceMonth ?? currentIsoMonth());
  const tone = FRESHNESS_TONE[freshness];
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 font-mono text-[11px] text-[var(--bp-color-ink-55)] ${className ?? ""}`}
      title={`Data freshness: ${tone?.label}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 self-center rounded-full"
        style={{ backgroundColor: tone?.color }}
      />
      Data as of {dataAsOf ?? "unknown"}
    </span>
  );
}
