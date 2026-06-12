import type { StudioRouteInsight } from "@/studio/api-contract";
import type { RouteDetailTabValue } from "./RouteDetailShell";
import {
  routeTabForInsight,
  safeInsightCaveats,
  stableInsightSort,
} from "./route-insight-placement";

export type RouteInsightMicroFigureKind =
  | "segment_strip"
  | "sparkline"
  | "timeline_tick"
  | "coverage_chip";

export type RouteInsightCardSpec = {
  detectorLabel: string;
  evidenceLabel: string;
  microFigureKind: RouteInsightMicroFigureKind;
  tab: RouteDetailTabValue;
  tabLabel: string;
};

export type RouteEvidenceIndexRow = {
  title: string;
  summary: string;
  detectorLabel: string;
  severity: StudioRouteInsight["severity"];
  monthLabel: string | null;
  tab: RouteDetailTabValue;
  tabLabel: string;
  citationLabel: string;
  referenceDetailLabel: string;
  caveats: string[];
};

export function routeInsightCardSpec(insight: StudioRouteInsight): RouteInsightCardSpec {
  const tab = routeTabForInsight(insight);
  const microFigureKind = routeInsightMicroFigureKind(insight, tab);

  return {
    detectorLabel: labelFromToken(insight.detectorId),
    evidenceLabel: evidenceLabel(insight),
    microFigureKind,
    tab,
    tabLabel: routeInsightTabLabel(tab),
  };
}

export function routeEvidenceIndexRows(
  insights: readonly StudioRouteInsight[],
): RouteEvidenceIndexRow[] {
  return [...insights].sort(stableInsightSort).map((insight) => {
    const spec = routeInsightCardSpec(insight);
    const counts = referenceCounts(insight);

    return {
      title: insight.title,
      summary: insight.shortText,
      detectorLabel: spec.detectorLabel,
      severity: insight.severity,
      monthLabel: insight.asOfMonth ?? insight.month ?? null,
      tab: spec.tab,
      tabLabel: spec.tabLabel,
      citationLabel: citationLabel(insight.refs.length),
      referenceDetailLabel: referenceDetailLabel(counts),
      caveats: safeInsightCaveats(insight, 2),
    };
  });
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

function referenceCounts(insight: StudioRouteInsight): {
  finding: number;
  source: number;
} {
  const finding = insight.refs.filter((ref) => ref.evidenceRefPath !== undefined).length;
  const source = insight.refs.filter((ref) => ref.sourceProjectionPath !== undefined).length;

  return { finding, source };
}

function citationLabel(count: number): string {
  if (count === 0) return "No cited refs";
  return `${count} cited ref${count === 1 ? "" : "s"}`;
}

function referenceDetailLabel(counts: { finding: number; source: number }): string {
  const parts = [
    counts.finding > 0 ? `${counts.finding} finding ref${counts.finding === 1 ? "" : "s"}` : null,
    counts.source > 0 ? `${counts.source} source ref${counts.source === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : "No public refs attached";
}

function labelFromToken(token: string): string {
  return token.replaceAll("_", " ");
}
