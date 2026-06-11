import type { StudioRouteInsight } from "@/studio/api-contract";

export type RouteInsightPlacements = {
  overview: StudioRouteInsight[];
  mapSegment: StudioRouteInsight[];
  chartAnnotation: StudioRouteInsight[];
  timeline: StudioRouteInsight[];
};

const severityRank: Record<StudioRouteInsight["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function stableInsightSort(left: StudioRouteInsight, right: StudioRouteInsight): number {
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    (left.month ?? "").localeCompare(right.month ?? "") * -1 ||
    left.detectorId.localeCompare(right.detectorId) ||
    (left.scopeId ?? "").localeCompare(right.scopeId ?? "")
  );
}

export function routeInsightPlacements(
  insights: readonly StudioRouteInsight[],
): RouteInsightPlacements {
  const sorted = [...insights].sort(stableInsightSort);
  return {
    overview: sorted.filter((insight) => insight.placement === "overview").slice(0, 2),
    mapSegment: sorted.filter((insight) => insight.placement === "map_segment"),
    chartAnnotation: sorted.filter((insight) => insight.placement === "chart_annotation"),
    timeline: sorted.filter((insight) => insight.placement === "timeline"),
  };
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
