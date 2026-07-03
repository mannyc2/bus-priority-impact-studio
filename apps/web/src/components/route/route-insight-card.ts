import type { StudioRouteInsight } from "@/studio/api-contract";
import {
  routeSectionForInsight,
  safeInsightCaveats,
  stableInsightSort,
} from "./route-insight-placement";
import type { RouteDetailSectionValue } from "./section-registry";

export type RouteInsightMicroFigureKind =
  | "segment_strip"
  | "sparkline"
  | "timeline_tick"
  | "coverage_chip";

export type RouteInsightCardSpec = {
  detectorLabel: string;
  evidenceLabel: string;
  microFigureKind: RouteInsightMicroFigureKind;
  section: RouteDetailSectionValue;
  sectionLabel: string;
};

export type RouteEvidenceIndexRow = {
  title: string;
  summary: string;
  detectorLabel: string;
  severity: StudioRouteInsight["severity"];
  monthLabel: string | null;
  section: RouteDetailSectionValue;
  sectionLabel: string;
  citationLabel: string;
  referenceDetailLabel: string;
  caveats: string[];
};

export function routeInsightCardSpec(insight: StudioRouteInsight): RouteInsightCardSpec {
  const section = routeSectionForInsight(insight);
  const microFigureKind = routeInsightMicroFigureKind(insight, section);

  return {
    detectorLabel: labelFromToken(insight.detectorId),
    evidenceLabel: evidenceLabel(insight),
    microFigureKind,
    section,
    sectionLabel: routeInsightSectionLabel(section),
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
      section: spec.section,
      sectionLabel: spec.sectionLabel,
      citationLabel: citationLabel(insight.refs.length),
      referenceDetailLabel: referenceDetailLabel(counts),
      caveats: safeInsightCaveats(insight, 2),
    };
  });
}

export function routeInsightSectionLabel(section: RouteDetailSectionValue): string {
  switch (section) {
    case "where-when":
      return "Where & when";
    case "treatments":
      return "Treatments & history";
    default:
      return section[0]?.toUpperCase() + section.slice(1);
  }
}

export function routeInsightMicroFigureKind(
  insight: StudioRouteInsight,
  section: RouteDetailSectionValue = routeSectionForInsight(insight),
): RouteInsightMicroFigureKind {
  if (
    insight.kind === "map_segment" ||
    insight.placement === "map_segment" ||
    (insight.target?.segmentIds?.length ?? 0) > 0 ||
    section === "map"
  ) {
    return "segment_strip";
  }
  if (insight.detectorId === "source_gap" || section === "evidence") return "coverage_chip";
  if (
    insight.kind === "timeline_annotation" ||
    insight.kind === "treatment_scope" ||
    section === "treatments"
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
  evidence: number;
  source: number;
} {
  const evidence = insight.refs.filter((ref) => ref.evidenceRefPath !== undefined).length;
  const source = insight.refs.filter((ref) => ref.sourceProjectionPath !== undefined).length;

  return { evidence, source };
}

function citationLabel(count: number): string {
  if (count === 0) return "No cited refs";
  return `${count} cited ref${count === 1 ? "" : "s"}`;
}

function referenceDetailLabel(counts: { evidence: number; source: number }): string {
  const parts = [
    counts.evidence > 0
      ? `${counts.evidence} evidence ref${counts.evidence === 1 ? "" : "s"}`
      : null,
    counts.source > 0 ? `${counts.source} source ref${counts.source === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" / ") : "No public refs attached";
}

function labelFromToken(token: string): string {
  return token.replaceAll("_", " ");
}
