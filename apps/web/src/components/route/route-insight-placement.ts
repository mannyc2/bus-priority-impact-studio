import type { StudioRouteInsight } from "@/studio/api-contract";
import type { RouteDetailSectionValue } from "./section-registry";

export type RouteInsightPlacements = {
  overview: StudioRouteInsight[];
  mapSegment: StudioRouteInsight[];
  chartAnnotation: StudioRouteInsight[];
  timeline: StudioRouteInsight[];
};

export type RouteSectionBadge = {
  count: number;
  severity: StudioRouteInsight["severity"];
};

const severityRank: Record<StudioRouteInsight["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const RELIABILITY_DETECTOR_IDS = new Set([
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
]);

const RIDER_IMPACT_DETECTOR_IDS = new Set([
  "customer_journey_shortfall",
  "rider_weighted_excess_wait",
]);

const TREATMENT_DETECTOR_IDS = new Set([
  "intervention_gap",
  "intervention_underperformance",
  "treatment_scope_mismatch",
  "treatment_scope_gap",
]);

export function stableInsightSort(left: StudioRouteInsight, right: StudioRouteInsight): number {
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    (left.asOfMonth ?? left.month ?? "").localeCompare(right.asOfMonth ?? right.month ?? "") * -1 ||
    left.detectorId.localeCompare(right.detectorId) ||
    (left.scopeId ?? "").localeCompare(right.scopeId ?? "")
  );
}

export function routeInsightPlacements(
  insights: readonly StudioRouteInsight[],
): RouteInsightPlacements {
  const sorted = [...insights].sort(stableInsightSort);
  return {
    overview: sorted.slice(0, 3),
    mapSegment: sorted.filter((insight) => insight.placement === "map_segment"),
    chartAnnotation: sorted.filter((insight) => insight.placement === "chart_annotation"),
    timeline: sorted.filter((insight) => insight.placement === "timeline"),
  };
}

export function routeSectionForInsight(insight: StudioRouteInsight): RouteDetailSectionValue {
  const title = insight.title.toLowerCase();
  if (
    insight.kind === "timeline_annotation" ||
    insight.kind === "treatment_scope" ||
    TREATMENT_DETECTOR_IDS.has(insight.detectorId)
  ) {
    return "treatments";
  }
  /* Segment-scoped findings point at the ranked segment list — the route's one
     map moved to Overview (plan 126) and the `map` section retired with it. */
  if (insight.kind === "map_segment" || insight.placement === "map_segment") return "where-when";
  if (
    insight.kind === "customer_journey" ||
    RIDER_IMPACT_DETECTOR_IDS.has(insight.detectorId) ||
    title.includes("rider") ||
    title.includes("customer")
  ) {
    return "riders";
  }
  if (
    RELIABILITY_DETECTOR_IDS.has(insight.detectorId) ||
    title.includes("reliability") ||
    title.includes("bunching") ||
    title.includes("long-gap")
  ) {
    return "reliability";
  }
  if (insight.detectorId === "source_gap") return "evidence";
  return "where-when";
}

export function routeSectionBadges(
  insights: readonly StudioRouteInsight[],
): Partial<Record<RouteDetailSectionValue, RouteSectionBadge>> {
  const badges: Partial<Record<RouteDetailSectionValue, RouteSectionBadge>> = {};
  for (const insight of insights) {
    const section = routeSectionForInsight(insight);
    const existing = badges[section];
    badges[section] =
      existing === undefined
        ? { count: 1, severity: insight.severity }
        : {
            count: existing.count + 1,
            severity:
              severityRank[insight.severity] < severityRank[existing.severity]
                ? insight.severity
                : existing.severity,
          };
  }
  return badges;
}

export function safeInsightCaveats(
  insight: Pick<StudioRouteInsight, "caveatsForTooltip">,
  limit = 3,
): string[] {
  return (insight.caveatsForTooltip ?? [])
    .filter((caveat) => {
      const lower = caveat.toLowerCase();
      return !lower.includes("internal") && !caveat.includes("_") && !caveat.includes(":");
    })
    .slice(0, limit);
}

export function insightTargetsSegment(
  insight: Pick<StudioRouteInsight, "scopeId" | "target">,
  segmentId: string,
): boolean {
  return (
    insight.target?.segmentIds?.includes(segmentId) ||
    insight.scopeId === segmentId ||
    insight.scopeId?.includes(segmentId) ||
    false
  );
}
