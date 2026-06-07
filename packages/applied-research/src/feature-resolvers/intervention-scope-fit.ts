import type {
  RouteSegmentTreatmentSummaryFeature,
  RouteTreatmentSourceGapFeature,
  RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";
import type { PanelManifest, PanelSpec } from "./panel-spec";

export const INTERVENTION_SCOPE_FIT_PANEL_V1_ID = "intervention_scope_fit_panel_v1" as const;
export const INTERVENTION_SCOPE_FIT_V1_ID = "intervention_scope_fit_v1" as const;

export type InterventionScopeFitPanelSpec = {
  readonly panelId: typeof INTERVENTION_SCOPE_FIT_PANEL_V1_ID;
  readonly month: string;
  readonly minCoveredOverlapShare: number;
  readonly minPartialOverlapShare: number;
  readonly routeId?: string;
};

export type InterventionScopeFitStatus =
  | "covered"
  | "partial_confirmed"
  | "true_uncovered"
  | "route_only"
  | "geometry_unavailable"
  | "source_gap_blocked"
  | "not_applicable";

export type InterventionScopeFitRow = {
  readonly routeId: string;
  readonly month: string;
  readonly treatmentType: string;
  readonly segmentId: string | null;
  readonly directionId: string | null;
  readonly segmentOrder: number | null;
  readonly fitStatus: InterventionScopeFitStatus;
  readonly matchMethod: string | null;
  readonly overlapShare: number | null;
  readonly routePositiveTreatmentCount: number;
  readonly segmentPositiveTreatmentCount: number;
  readonly sourceGapCount: number;
  readonly sourceGapKinds: readonly string[];
  readonly blocksClaims: readonly string[];
  readonly sourceRefs: readonly string[];
};

export type InterventionScopeFitArtifactV1 = {
  readonly artifactKind: typeof INTERVENTION_SCOPE_FIT_V1_ID;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly month: string;
  readonly panelSpec: InterventionScopeFitPanelSpec;
  readonly panelManifest: PanelManifest;
  readonly summary: {
    readonly routeCount: number;
    readonly rowCount: number;
    readonly segmentRowCount: number;
    readonly routeOnlyRowCount: number;
    readonly sourceGapBlockedRowCount: number;
    readonly fitStatusCounts: Record<InterventionScopeFitStatus, number>;
    readonly treatmentTypeCounts: Record<string, number>;
  };
  readonly rows: readonly InterventionScopeFitRow[];
};

function key(parts: readonly (string | null)[]): string {
  return parts.map((part) => part ?? "").join("\0");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function emptyFitStatusCounts(): Record<InterventionScopeFitStatus, number> {
  return {
    covered: 0,
    partial_confirmed: 0,
    true_uncovered: 0,
    route_only: 0,
    geometry_unavailable: 0,
    source_gap_blocked: 0,
    not_applicable: 0,
  };
}

function isPositiveTreatmentStatus(status: string): boolean {
  return status === "current_confirmed" || status === "implemented";
}

export function interventionScopeFitPanelSpecV1(input: InterventionScopeFitPanelSpec): PanelSpec {
  const spec: PanelSpec = {
    panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
    schemaVersion: 1,
    grain: "route_id + month + treatment_type + segment_id",
    timeKey: "month",
    entityKeys: ["route_id", "treatment_type", "segment_id"],
    measures: ["fit_status", "overlap_share", "match_method", "source_gap_count"],
    joins: [
      "route_treatment_summary",
      "route_segment_treatment_summary",
      "route_treatment_source_gap",
    ],
    coverage: [
      "route_positive_treatment_count",
      "segment_positive_treatment_count",
      "source_gap_count",
      "fit_status",
    ],
    historyWindow: {
      startMonth: input.month,
      endMonth: input.month,
    },
    releaseFilter: { month: input.month },
    requiredProducts: [
      {
        productId: "route_treatment_summary_artifact",
        state: "available",
        role: "artifact",
        reason:
          "Deterministic treatment summary rows, segment overlap rows, and source-gap rows.",
      },
    ],
    eligibilityRules: [
      {
        ruleId: "covered_overlap_share",
        description: "Minimum overlap share treated as covered segment scope.",
        threshold: input.minCoveredOverlapShare,
      },
      {
        ruleId: "partial_overlap_share",
        description: "Minimum positive overlap share treated as partial confirmed segment scope.",
        threshold: input.minPartialOverlapShare,
      },
    ],
    negativeMeaning:
      "A true-uncovered row means the segment had observed treatment-geometry matching support and no overlap for this treatment type; source-gap and geometry-unavailable rows block absence claims.",
  };
  return input.routeId === undefined ? spec : { ...spec, scopeFilter: { routeId: input.routeId } };
}

function fitStatusFor(input: {
  readonly segment: RouteSegmentTreatmentSummaryFeature;
  readonly sourceGapCount: number;
  readonly minCoveredOverlapShare: number;
  readonly minPartialOverlapShare: number;
}): InterventionScopeFitStatus {
  if (input.sourceGapCount > 0 && input.segment.treatmentType === "transit_signal_priority") {
    return "source_gap_blocked";
  }
  if (
    input.segment.matchMethod === "source_only" ||
    input.segment.matchMethod === "route_level" ||
    input.segment.overlapShare === null
  ) {
    return "geometry_unavailable";
  }
  if (isPositiveTreatmentStatus(input.segment.status)) {
    if (input.segment.overlapShare >= input.minCoveredOverlapShare) return "covered";
    if (input.segment.overlapShare >= input.minPartialOverlapShare) return "partial_confirmed";
    return "true_uncovered";
  }
  if (input.segment.status === "not_found" && input.segment.matchMethod === "not_matched") {
    return "true_uncovered";
  }
  if (input.segment.status === "source_gap") return "source_gap_blocked";
  return "not_applicable";
}

export function buildInterventionScopeFitArtifactV1(input: {
  readonly routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  readonly routeSegmentTreatmentFeatures: readonly RouteSegmentTreatmentSummaryFeature[];
  readonly routeTreatmentSourceGapFeatures: readonly RouteTreatmentSourceGapFeature[];
  readonly spec: InterventionScopeFitPanelSpec;
  readonly generatedAt: string;
  readonly artifactPath?: string | null;
}): InterventionScopeFitArtifactV1 {
  const routeTreatmentByRouteType = new Map<string, RouteTreatmentSummaryFeature[]>();
  for (const feature of input.routeTreatmentFeatures) {
    if (feature.month !== input.spec.month) continue;
    if (input.spec.routeId !== undefined && feature.routeId !== input.spec.routeId) continue;
    const mapKey = key([feature.routeId, feature.treatmentType]);
    const current = routeTreatmentByRouteType.get(mapKey) ?? [];
    current.push(feature);
    routeTreatmentByRouteType.set(mapKey, current);
  }

  const sourceGapsByRouteType = new Map<string, RouteTreatmentSourceGapFeature[]>();
  for (const feature of input.routeTreatmentSourceGapFeatures) {
    if (feature.month !== input.spec.month || feature.routeId === null) continue;
    if (input.spec.routeId !== undefined && feature.routeId !== input.spec.routeId) continue;
    const mapKey = key([feature.routeId, feature.treatmentType]);
    const current = sourceGapsByRouteType.get(mapKey) ?? [];
    current.push(feature);
    sourceGapsByRouteType.set(mapKey, current);
  }

  const rows: InterventionScopeFitRow[] = [];
  const segmentKeys = new Set<string>();
  for (const feature of input.routeSegmentTreatmentFeatures) {
    if (feature.month !== input.spec.month) continue;
    if (input.spec.routeId !== undefined && feature.routeId !== input.spec.routeId) continue;
    const mapKey = key([feature.routeId, feature.treatmentType]);
    const routeTreatments = routeTreatmentByRouteType.get(mapKey) ?? [];
    const sourceGaps = sourceGapsByRouteType.get(mapKey) ?? [];
    const positiveRouteTreatmentCount = routeTreatments.filter((row) =>
      isPositiveTreatmentStatus(row.status),
    ).length;
    const positiveSegmentTreatmentCount = isPositiveTreatmentStatus(feature.status) ? 1 : 0;
    const sourceRefs = uniqueSorted([
      ...feature.sourceRefs,
      ...routeTreatments.flatMap((row) => row.sourceRefs),
      ...sourceGaps.flatMap((row) => row.sourceRefs),
    ]);
    rows.push({
      routeId: feature.routeId,
      month: feature.month,
      treatmentType: feature.treatmentType,
      segmentId: feature.segmentId,
      directionId: feature.directionId,
      segmentOrder: feature.segmentOrder,
      fitStatus: fitStatusFor({
        segment: feature,
        sourceGapCount: sourceGaps.length,
        minCoveredOverlapShare: input.spec.minCoveredOverlapShare,
        minPartialOverlapShare: input.spec.minPartialOverlapShare,
      }),
      matchMethod: feature.matchMethod,
      overlapShare: feature.overlapShare,
      routePositiveTreatmentCount: positiveRouteTreatmentCount,
      segmentPositiveTreatmentCount: positiveSegmentTreatmentCount,
      sourceGapCount: sourceGaps.length,
      sourceGapKinds: uniqueSorted(sourceGaps.map((row) => row.gapKind)),
      blocksClaims: uniqueSorted(sourceGaps.flatMap((row) => row.blocksClaims)),
      sourceRefs,
    });
    segmentKeys.add(feature.segmentId);
  }

  for (const [mapKey, routeTreatments] of routeTreatmentByRouteType.entries()) {
    const [routeId, treatmentType] = mapKey.split("\0");
    if (routeId === undefined || treatmentType === undefined) continue;
    const hasSegmentRows = rows.some(
      (row) => row.routeId === routeId && row.treatmentType === treatmentType,
    );
    const positiveRouteTreatmentCount = routeTreatments.filter((row) =>
      isPositiveTreatmentStatus(row.status),
    ).length;
    if (hasSegmentRows || positiveRouteTreatmentCount === 0) continue;
    const sourceGaps = sourceGapsByRouteType.get(mapKey) ?? [];
    rows.push({
      routeId,
      month: input.spec.month,
      treatmentType,
      segmentId: null,
      directionId: null,
      segmentOrder: null,
      fitStatus: sourceGaps.length > 0 ? "source_gap_blocked" : "route_only",
      matchMethod: "route_level",
      overlapShare: null,
      routePositiveTreatmentCount: positiveRouteTreatmentCount,
      segmentPositiveTreatmentCount: 0,
      sourceGapCount: sourceGaps.length,
      sourceGapKinds: uniqueSorted(sourceGaps.map((row) => row.gapKind)),
      blocksClaims: uniqueSorted(sourceGaps.flatMap((row) => row.blocksClaims)),
      sourceRefs: uniqueSorted([
        ...routeTreatments.flatMap((row) => row.sourceRefs),
        ...sourceGaps.flatMap((row) => row.sourceRefs),
      ]),
    });
  }

  const sortedRows = rows.sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.treatmentType.localeCompare(right.treatmentType) ||
      (left.segmentOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.segmentOrder ?? Number.MAX_SAFE_INTEGER) ||
      (left.segmentId ?? "").localeCompare(right.segmentId ?? ""),
  );
  const fitStatuses = sortedRows.map((row) => row.fitStatus);
  const fitStatusCounts = emptyFitStatusCounts();
  for (const [status, count] of Object.entries(countBy(fitStatuses))) {
    fitStatusCounts[status as InterventionScopeFitStatus] = count;
  }
  const panelManifest: PanelManifest = {
    panelId: INTERVENTION_SCOPE_FIT_PANEL_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    spec: interventionScopeFitPanelSpecV1(input.spec),
    inputRefs: [
      {
        refKind: "artifact",
        refId: "route_treatment_summary_artifact",
        role: "primary_intervention_scope_source",
      },
    ],
    summary: {
      sourceRowCount:
        input.routeTreatmentFeatures.length +
        input.routeSegmentTreatmentFeatures.length +
        input.routeTreatmentSourceGapFeatures.length,
      supportedRowCount: sortedRows.length,
      panelRowCount: sortedRows.length,
      routeCount: new Set(sortedRows.map((row) => row.routeId)).size,
      entityCount: segmentKeys.size,
      monthCount: sortedRows.length > 0 ? 1 : 0,
    },
    limitations: [
      "Segment fit is based on deterministic route-shape overlap and treatment summary rows; it is not an audited lane-mile inventory.",
      "TSP current inventory source gaps block absence and coverage claims.",
      "Observed segment ids include the analysis month and are not yet a route-shape-version-proof linear reference.",
    ],
  };

  return {
    artifactKind: INTERVENTION_SCOPE_FIT_V1_ID,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    artifactPath: input.artifactPath ?? null,
    month: input.spec.month,
    panelSpec: input.spec,
    panelManifest,
    summary: {
      routeCount: panelManifest.summary.routeCount,
      rowCount: sortedRows.length,
      segmentRowCount: sortedRows.filter((row) => row.segmentId !== null).length,
      routeOnlyRowCount: sortedRows.filter((row) => row.fitStatus === "route_only").length,
      sourceGapBlockedRowCount: sortedRows.filter(
        (row) => row.fitStatus === "source_gap_blocked",
      ).length,
      fitStatusCounts,
      treatmentTypeCounts: countBy(sortedRows.map((row) => row.treatmentType)),
    },
    rows: sortedRows,
  };
}
