import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioSegment,
} from "@/studio/api-contract";
import { dossierMetricMonthCount, dossierMetricWindow, formatCompact } from "./route-derived";

type SummaryRoute = Pick<StudioRoute, "weightedAvgSpeed">;
type SummarySegment = Pick<StudioSegment, "from" | "to" | "riderHours" | "speedMph">;

export type WhereWhenSummary = {
  currentSpeedLabel: string;
  peerLabel: string;
  movementLabel: string;
  movementDetail: string;
  movementTone: "neutral" | "good" | "bad";
  coverageLabel: string;
  windowLabel: string;
  worstSegmentLabel: string;
  worstSegmentDetail: string;
  dataAsOf: string | null;
  sectionSubtitle: string;
};

export function whereWhenSummary({
  route,
  segments,
  dossier,
}: {
  route: SummaryRoute;
  segments: readonly SummarySegment[];
  dossier: RouteDossierSummaryForDetail | null;
}): WhereWhenSummary {
  const speed = dossier?.speed;
  const currentSpeed = speed?.current ?? route.weightedAvgSpeed;
  const monthCount = dossierMetricMonthCount(speed);
  const window = dossierMetricWindow(speed);
  const movement = speed?.movement6mPct ?? null;
  const worstSegment = dossier?.worstSegment ?? null;
  const fallbackWorst = [...segments].sort((a, b) => b.riderHours - a.riderHours)[0] ?? null;

  return {
    currentSpeedLabel: `${currentSpeed.toFixed(1)} mph`,
    peerLabel: peerFraming(speed?.peerPercentile ?? null),
    movementLabel: signedPct(movement),
    movementDetail: movementDetail(movement),
    movementTone: movement === null ? "neutral" : movement < 0 ? "bad" : "good",
    coverageLabel:
      monthCount > 0
        ? `${monthCount} ${plural(monthCount, "month")} of route-speed history`
        : `${segments.length} ${plural(segments.length, "timepoint segment")}`,
    windowLabel: window ?? "current projection",
    worstSegmentLabel:
      worstSegment?.label ??
      (fallbackWorst ? `${fallbackWorst.from} to ${fallbackWorst.to}` : "No segment surfaced"),
    worstSegmentDetail: worstSegment
      ? `${worstSegment.persistenceMonths} ${plural(worstSegment.persistenceMonths, "trailing month")} as the slowest segment`
      : fallbackWorst
        ? `${formatCompact(fallbackWorst.riderHours)} rider-hours lost / day`
        : "no segment-level speed rows in this release",
    dataAsOf: speed?.dataAsOf ?? dossier?.dataAsOf ?? null,
    sectionSubtitle: sectionSubtitle(segments.length, monthCount, window),
  };
}

function signedPct(value: number | null): string {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function movementDetail(value: number | null): string {
  if (value === null) return "not enough history for a 6-month comparison";
  if (value < -0.05) return "slower over 6 months";
  if (value > 0.05) return "faster over 6 months";
  return "flat over 6 months";
}

function peerFraming(peerPercentile: number | null): string {
  if (peerPercentile === null) return "no peer ranking yet";
  const rounded = Math.round(peerPercentile);
  return rounded >= 50
    ? `faster than ${rounded}% of local routes`
    : `slower than ${100 - rounded}% of local routes`;
}

function sectionSubtitle(segmentCount: number, monthCount: number, window: string | null): string {
  if (monthCount > 0 && window !== null) {
    return `${segmentCount} ${plural(segmentCount, "timepoint segment")} with ${monthCount} ${plural(monthCount, "month")} of route-speed history (${window}).`;
  }
  return `${segmentCount} ${plural(segmentCount, "timepoint segment")} in the current serving projection. Hour strip shows severity by time of day.`;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
