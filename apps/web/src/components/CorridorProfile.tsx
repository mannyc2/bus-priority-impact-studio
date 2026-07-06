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
  scheduled: number | null;
  riderHours: number;
  lane: StudioSegment["lane"];
  ace: boolean;
  tsp: boolean;
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
  const scheduledSpeeds = [
    ...ordered.flatMap((segment) => (segment.scheduledMph === null ? [] : [segment.scheduledMph])),
    ...(route.scheduledMph === null ? [] : [route.scheduledMph]),
  ];
  const maxSpeed = Math.max(
    ...ordered.map((s) => s.speedMph),
    ...scheduledSpeeds,
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
    isWorst: segment.id === worstId,
  }));

  return (
    <Suspense fallback={<ChartFallback height={Math.max(170, rows.length * 34 + 56)} />}>
      <CorridorProfileChart rows={rows} lo={lo} hi={hi} scheduledTarget={route.scheduledMph} />
    </Suspense>
  );
}

function resolveWorstId(
  segments: readonly StudioSegment[],
  highlightId: string | undefined,
): string | undefined {
  if (highlightId && segments.some((s) => s.id === highlightId)) return highlightId;
  return segments.find((s) => s.flagged)?.id;
}

function shortStop(label: string) {
  return label
    .replace(/^East /i, "E ")
    .replace(/^West /i, "W ")
    .replace(/ Avenue/gi, " Av");
}
