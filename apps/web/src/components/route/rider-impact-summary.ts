import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  formatCompact,
} from "@/components/route/route-derived";
import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioRouteInsight,
  StudioSegment,
} from "@/studio/api-contract";
import { stableInsightSort } from "./route-insight-placement";

type RiderImpactRoute = Pick<StudioRoute, "dailyRiders" | "ridersYoyPct" | "riderHoursLost">;
type RiderImpactSegment = Pick<
  StudioSegment,
  "id" | "from" | "to" | "riderHours" | "flagged" | "spineSegmentId"
>;

export type RiderImpactSummary = {
  dailyRidersLabel: string;
  dailyRidersDetail: string;
  burdenLabel: string;
  burdenDetail: string;
  trendLabel: string;
  trendDetail: string;
  historyLabel: string;
  historyDetail: string;
  /** Highest rider-hour burden segment — the KPI headline fact. The full
   * ranking lives only on the Segments tab (one segment surface, plan 081). */
  topSegment: RiderImpactSegment | null;
};

const RIDER_IMPACT_DETECTOR_IDS = new Set([
  "customer_journey_shortfall",
  "rider_weighted_excess_wait",
]);

export function riderImpactSummary({
  route,
  segments = [],
  dossier,
}: {
  route: RiderImpactRoute;
  segments?: readonly RiderImpactSegment[];
  dossier: RouteDossierSummaryForDetail | null;
}): RiderImpactSummary {
  const ridership = dossier?.ridership;
  const monthCount = dossierMetricMonthCount(ridership);
  const historyWindow = dossierMetricWindow(ridership);
  const trendLabel =
    ridership?.movement6mPct === null || ridership?.movement6mPct === undefined
      ? route.ridersYoyPct === null
        ? "not measured"
        : `${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}%`
      : formatSignedPct(ridership.movement6mPct);
  const trendDetail =
    ridership?.movement6mPct === null || ridership?.movement6mPct === undefined
      ? route.ridersYoyPct === null
        ? "trend unavailable"
        : "YoY in current projection"
      : "6 mo ridership trend";
  const topSegment = [...segments].sort((a, b) => b.riderHours - a.riderHours).at(0) ?? null;
  const historyLabel = monthCount > 0 ? `${monthCount} months` : "current";
  const historyDetail =
    monthCount > 0
      ? `${historyWindow ?? "monthly ridership history"}`
      : /* Never the raw capability reason: it is a pipeline diagnostic. */
        "Monthly ridership not attached yet.";
  const burdenLabel =
    route.riderHoursLost === null ? "not measured" : formatRiderHours(route.riderHoursLost);

  return {
    dailyRidersLabel: formatCompact(route.dailyRiders),
    dailyRidersDetail: `${trendLabel} ${trendDetail}`,
    burdenLabel,
    burdenDetail:
      route.riderHoursLost === null
        ? "rider-hour burden not measured"
        : route.riderHoursLost > 0
          ? "rider-hours lost/day in projection"
          : "no rider-hour loss in projection",
    trendLabel,
    trendDetail,
    historyLabel,
    historyDetail,
    topSegment,
  };
}

export function riderImpactInsightRows(
  insights: readonly StudioRouteInsight[],
): StudioRouteInsight[] {
  return insights
    .filter((insight) => {
      const title = insight.title.toLowerCase();
      return (
        insight.kind === "customer_journey" ||
        RIDER_IMPACT_DETECTOR_IDS.has(insight.detectorId) ||
        title.includes("rider") ||
        title.includes("customer")
      );
    })
    .sort(stableInsightSort)
    .slice(0, 3);
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRiderHours(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}
