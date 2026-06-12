import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioSegment,
} from "@/studio/api-contract";
import { dossierMetricMonthCount, dossierMetricWindow, formatCompact } from "./route-derived";

type SummaryRoute = Pick<StudioRoute, "weightedAvgSpeed">;
type SummarySegment = Pick<StudioSegment, "from" | "to" | "riderHours" | "speedMph">;
type SegmentWithId = Pick<StudioSegment, "id">;

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
        ? `${monthCount} ${plural(monthCount, "month")} speed history`
        : `${segments.length} ${plural(segments.length, "timepoint segment")}`,
    windowLabel: window ?? "current projection",
    worstSegmentLabel:
      worstSegment?.label ??
      (fallbackWorst ? `${fallbackWorst.from} to ${fallbackWorst.to}` : "No segment surfaced"),
    worstSegmentDetail: worstSegment
      ? `${worstSegment.persistenceMonths} ${plural(worstSegment.persistenceMonths, "month")} slowest`
      : fallbackWorst
        ? `${formatCompact(fallbackWorst.riderHours)} rider-hr/day`
        : "no segment-level speed rows in this release",
    dataAsOf: speed?.dataAsOf ?? dossier?.dataAsOf ?? null,
    sectionSubtitle: sectionSubtitle(segments.length, monthCount, window),
  };
}

export function whereWhenSegmentBadge({
  segment,
  dossier,
}: {
  segment: SegmentWithId;
  dossier: RouteDossierSummaryForDetail | null;
}): string | null {
  const worst = dossier?.worstSegment ?? null;
  if (worst === null || worst.segmentId !== segment.id) return null;
  return `${worst.persistenceMonths} mo worst`;
}

function signedPct(value: number | null): string {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function movementDetail(value: number | null): string {
  if (value === null) return "not enough 6-month history";
  if (value < -0.05) return "slower over 6 mo";
  if (value > 0.05) return "faster over 6 mo";
  return "flat over 6 mo";
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
    return `${segmentCount} ${plural(segmentCount, "segment")} with ${monthCount} ${plural(monthCount, "month")} speed history (${window}).`;
  }
  return `${segmentCount} ${plural(segmentCount, "segment")} in current projection. Hour strip shows time-of-day severity.`;
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
