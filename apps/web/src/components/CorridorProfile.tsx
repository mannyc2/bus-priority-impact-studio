import { lazy, Suspense } from "react";
import { ChartFallback } from "@/components/ChartFallback";
import type { StudioRouteDetailResponse, StudioSegment } from "@/studio/api-contract";
import { orderCorridorSegments } from "./CorridorMap";

// Lazy boundary: keeps Recharts out of the eager bundle, matching the other charts.
const CorridorProfileChart = lazy(() =>
  import("./CorridorProfile.chart.js").then((module) => ({ default: module.CorridorProfileChart })),
);

export type CorridorRow = {
  key: string;
  label: string;
  from: string;
  to: string;
  observed: number;
  scheduled: number;
  riderHours: number;
  lane: StudioSegment["lane"];
  ace: boolean;
  tsp: boolean;
  severity: "good" | "warn" | "bad";
  isWorst: boolean;
};

export function CorridorProfile({
  route,
  segments,
  highlightId,
}: {
  route: StudioRouteDetailResponse["route"];
  segments: readonly StudioSegment[];
  highlightId?: string | undefined;
}) {
  const ordered = orderCorridorSegments(route.slug, segments);

  if (ordered.length === 0) {
    return (
      <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
        No visible timepoint segments are available for this route.
      </div>
    );
  }

  const minSpeed = Math.min(...ordered.map((s) => s.speedMph), route.weightedAvgSpeed);
  const maxSpeed = Math.max(
    ...ordered.map((s) => s.scheduledMph),
    route.scheduledMph,
    route.weightedAvgSpeed,
  );
  const lo = Math.max(0, Math.floor(minSpeed - 1));
  const hi = Math.ceil(maxSpeed + 1);

  const worstId = resolveWorstId(ordered, highlightId);
  const rows: CorridorRow[] = ordered.map((segment) => ({
    key: segment.id,
    label: shortStop(segment.from),
    from: segment.from,
    to: segment.to,
    observed: segment.speedMph,
    scheduled: segment.scheduledMph,
    riderHours: segment.riderHours,
    lane: segment.lane,
    ace: segment.ace,
    tsp: segment.tsp,
    severity: severityOf(segment.speedMph),
    isWorst: segment.id === worstId,
  }));

  const laneFull = ordered.filter((s) => s.lane === "yes").length;
  const lanePartial = ordered.filter((s) => s.lane === "partial" || s.lane === "minimal").length;
  const aceCount = ordered.filter((s) => s.ace).length;
  const tspCount = ordered.filter((s) => s.tsp).length;
  const pct = (count: number) => `${Math.round((count / ordered.length) * 100)}%`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-[var(--bp-color-ink-70)]">
          <span className="inline-flex items-center gap-1.5 text-[var(--bp-color-ink-55)]">
            <Dot color="var(--bp-color-good)" />
            <Dot color="var(--bp-color-warn)" />
            <Dot color="var(--bp-color-bad)" />
            observed mph by speed band
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-[1.5px] border-dashed border-[var(--bp-color-ink-55)]" />
            scheduled
          </span>
        </div>
        <div className="font-mono text-[9.5px] text-[var(--bp-color-ink-40)]">
          hover a segment for treatments &amp; detail
        </div>
      </div>

      <Suspense fallback={<ChartFallback height={Math.max(170, rows.length * 34 + 56)} />}>
        <CorridorProfileChart rows={rows} lo={lo} hi={hi} scheduledTarget={route.scheduledMph} />
      </Suspense>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--bp-color-rule)] pt-2 font-mono text-[10px] text-[var(--bp-color-ink-55)]">
        <span>
          Lane {pct(laneFull)} full{lanePartial ? ` · ${lanePartial} partial` : ""}
        </span>
        <span>ACE {pct(aceCount)}</span>
        <span>TSP {pct(tspCount)}</span>
        <span className="ml-auto">{ordered.length} timepoint segments · north → south</span>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="size-2 rounded-full" style={{ background: color }} />;
}

function resolveWorstId(
  segments: readonly StudioSegment[],
  highlightId: string | undefined,
): string | undefined {
  if (highlightId && segments.some((s) => s.id === highlightId)) return highlightId;
  return segments.find((s) => s.flagged)?.id;
}

function severityOf(mph: number): CorridorRow["severity"] {
  if (mph < 5) return "bad";
  if (mph < 6.5) return "warn";
  return "good";
}

function shortStop(label: string) {
  return label
    .replace(/^East /i, "E ")
    .replace(/^West /i, "W ")
    .replace(/ Avenue/gi, " Av");
}
