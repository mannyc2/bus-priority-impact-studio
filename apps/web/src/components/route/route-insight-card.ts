import type { StudioRouteInsight } from "@/studio/api-contract";
import type { RouteDetailTabValue } from "./RouteDetailShell";
import { routeTabForInsight } from "./route-insight-placement";

export type RouteInsightMicroFigureKind =
  | "segment_strip"
  | "sparkline"
  | "timeline_tick"
  | "coverage_chip";

export type RouteInsightCardSpec = {
  detectorLabel: string;
  evidenceLabel: string;
  microFigureKind: RouteInsightMicroFigureKind;
  microFigureLabel: string;
  tab: RouteDetailTabValue;
  tabLabel: string;
};

export function routeInsightCardSpec(insight: StudioRouteInsight): RouteInsightCardSpec {
  const tab = routeTabForInsight(insight);
  const microFigureKind = routeInsightMicroFigureKind(insight, tab);

  return {
    detectorLabel: labelFromToken(insight.detectorId),
    evidenceLabel: evidenceLabel(insight),
    microFigureKind,
    microFigureLabel: microFigureLabel(microFigureKind),
    tab,
    tabLabel: routeInsightTabLabel(tab),
  };
}

export function routeInsightTabLabel(tab: RouteDetailTabValue): string {
  switch (tab) {
    case "where-when":
      return "Where & when";
    case "treatments":
      return "Treatments";
    default:
      return tab[0]?.toUpperCase() + tab.slice(1);
  }
}

export function routeInsightMicroFigureKind(
  insight: StudioRouteInsight,
  tab: RouteDetailTabValue = routeTabForInsight(insight),
): RouteInsightMicroFigureKind {
  if (
    insight.kind === "map_segment" ||
    insight.placement === "map_segment" ||
    (insight.target?.segmentIds?.length ?? 0) > 0 ||
    tab === "map"
  ) {
    return "segment_strip";
  }
  if (insight.detectorId === "source_gap" || tab === "evidence") return "coverage_chip";
  if (
    insight.kind === "timeline_annotation" ||
    insight.kind === "treatment_scope" ||
    tab === "treatments"
  ) {
    return "timeline_tick";
  }
  return "sparkline";
}

function evidenceLabel(insight: StudioRouteInsight): string {
  if (insight.detectorId === "source_gap") return "Source gap";
  const refCount = insight.refs.length;
  if (refCount === 0) return "No cited refs";
  return `${refCount} cited ref${refCount === 1 ? "" : "s"}`;
}

function microFigureLabel(kind: RouteInsightMicroFigureKind): string {
  switch (kind) {
    case "segment_strip":
      return "Segment cue";
    case "timeline_tick":
      return "Timeline cue";
    case "coverage_chip":
      return "Coverage cue";
    case "sparkline":
      return "Trend cue";
  }
}

function labelFromToken(token: string): string {
  return token.replaceAll("_", " ");
}
