import {
  dossierMetricMonthCount,
  dossierMetricWindow,
  formatCompact,
} from "@/components/route/route-derived";
import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteInsight,
  StudioSegment,
} from "@/studio/api-contract";
import type { MetricTone } from "@/studio/metric-model";

type RiderImpactRoute = Pick<StudioRoute, "dailyRiders" | "ridersYoyPct" | "riderHoursLost">;
type RiderImpactSegment = Pick<StudioSegment, "id" | "from" | "to" | "riderHours" | "flagged">;

export type RiderImpactSummary = {
  kpiValue: string;
  kpiSub: string;
  kpiTone: MetricTone;
  sectionSubtitle: string;
  dailyRidersLabel: string;
  dailyRidersDetail: string;
  burdenLabel: string;
  burdenDetail: string;
  trendLabel: string;
  trendDetail: string;
  historyLabel: string;
  historyDetail: string;
  topSegmentLabel: string;
  topSegmentDetail: string;
  topSegmentShareLabel: string;
  dataAsOf: string | null;
  topSegments: RiderImpactSegment[];
};

const RIDER_IMPACT_DETECTOR_IDS = new Set(["customer_journey_shortfall"]);

export function riderImpactSummary({
  route,
  segments = [],
  dossier,
  capability,
}: {
  route: RiderImpactRoute;
  segments?: readonly RiderImpactSegment[];
  dossier: RouteDossierSummaryForDetail | null;
  capability: RouteSurfaceCapability | null;
}): RiderImpactSummary {
  const ridership = dossier?.ridership;
  const monthCount = dossierMetricMonthCount(ridership);
  const historyWindow = dossierMetricWindow(ridership);
  const trendLabel =
    ridership?.movement6mPct === null || ridership?.movement6mPct === undefined
      ? `${route.ridersYoyPct >= 0 ? "+" : ""}${route.ridersYoyPct.toFixed(1)}%`
      : formatSignedPct(ridership.movement6mPct);
  const trendDetail =
    ridership?.movement6mPct === null || ridership?.movement6mPct === undefined
      ? "year over year in the current route projection"
      : "over 6 months in the dossier ridership series";
  const topSegments = [...segments].sort((a, b) => b.riderHours - a.riderHours).slice(0, 6);
  const topSegment = topSegments[0] ?? null;
  const topShare =
    topSegment !== null && route.riderHoursLost > 0 && topSegment.riderHours <= route.riderHoursLost
      ? `${Math.round((topSegment.riderHours / route.riderHoursLost) * 100)}% of route burden`
      : topSegment === null
        ? "share unavailable"
        : "route-leading segment";
  const dataAsOf = ridership?.dataAsOf ?? capability?.dataAsOf ?? null;
  const historyLabel = monthCount > 0 ? `${monthCount} months` : "current";
  const historyDetail =
    monthCount > 0
      ? `${historyWindow ?? "monthly ridership history"}`
      : (capability?.reason ?? "Monthly ridership history is not attached to this route yet.");
  const burdenLabel = formatRiderHours(route.riderHoursLost);

  return {
    kpiValue: formatCompact(route.dailyRiders),
    kpiSub:
      route.riderHoursLost > 0
        ? `${burdenLabel} rider-hours lost/day`
        : `${trendLabel} rider trend`,
    kpiTone: route.riderHoursLost >= 5_000 ? "bad" : "ink",
    sectionSubtitle:
      topSegment === null
        ? "Daily riders and rider-hour burden from the current route projection."
        : `Daily riders, rider-hour burden, and the highest-impact segment: ${topSegment.from} to ${topSegment.to}.`,
    dailyRidersLabel: formatCompact(route.dailyRiders),
    dailyRidersDetail: `${trendLabel} ${trendDetail}`,
    burdenLabel,
    burdenDetail:
      route.riderHoursLost > 0
        ? "rider-hours lost per weekday in the current projection"
        : "no rider-hour loss in the current projection",
    trendLabel,
    trendDetail,
    historyLabel,
    historyDetail,
    topSegmentLabel: topSegment === null ? "n/a" : formatRiderHours(topSegment.riderHours),
    topSegmentDetail:
      topSegment === null ? "no segment data" : `${topSegment.from} to ${topSegment.to}`,
    topSegmentShareLabel: topShare,
    dataAsOf,
    topSegments,
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
    .slice(0, 3);
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRiderHours(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}
