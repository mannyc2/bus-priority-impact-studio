import type {
  RouteSegmentTreatmentSummaryFeature,
  RouteTreatmentSourceGapFeature,
  RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";
import type { RouteTreatmentSummaryArtifact } from "../treatments";

export type TreatmentSummaryFeatureResolverResult = {
  routeTreatmentFeatures: RouteTreatmentSummaryFeature[];
  routeSegmentTreatmentFeatures: RouteSegmentTreatmentSummaryFeature[];
  routeTreatmentSourceGapFeatures: RouteTreatmentSourceGapFeature[];
  summary: Record<string, unknown>;
};

function routeMatches(routeId: string | null | undefined, filter: string | undefined): boolean {
  return filter === undefined || routeId === filter;
}

const LANE_TYPE_REF_PREFIX = "nyc_dot_bus_lane_type:";

// Lane types for the typed feature field. Prefer the materializer's typed `laneTypes`; for artifacts
// materialized before that field existed, recover them from the `nyc_dot_bus_lane_type:` sourceRefs
// (the exact data the detectors used to string-parse at gate time) so behavior is unchanged (S2.3).
function laneTypesForSegmentRow(row: {
  laneTypes?: readonly string[];
  sourceRefs: readonly string[];
}): string[] {
  if (Array.isArray(row.laneTypes)) return [...row.laneTypes];
  return row.sourceRefs
    .filter((ref) => ref.startsWith(LANE_TYPE_REF_PREFIX))
    .map((ref) => ref.slice(LANE_TYPE_REF_PREFIX.length));
}

export function buildTreatmentFeaturesFromSummaryArtifact(input: {
  artifact: RouteTreatmentSummaryArtifact;
  routeId?: string;
}): TreatmentSummaryFeatureResolverResult {
  const routeTreatmentFeatures = input.artifact.routeTreatmentRows
    .filter((row) => routeMatches(row.routeId, input.routeId))
    .map((row) => ({
      routeId: row.routeId,
      month: row.month,
      treatmentType: row.treatmentType,
      status: row.status,
      geographyScope: row.geographyScope,
      evidenceLabel: row.evidenceLabel,
      confidence: row.confidence,
      sourceRefs: [...row.sourceRefs],
    }));

  const routeSegmentTreatmentFeatures = input.artifact.segmentTreatmentRows
    .filter((row) => routeMatches(row.routeId, input.routeId))
    .map((row) => ({
      routeId: row.routeId,
      month: row.month,
      treatmentType: row.treatmentType,
      status: row.status,
      geographyScope: row.geographyScope,
      evidenceLabel: row.evidenceLabel,
      confidence: row.confidence,
      sourceRefs: [...row.sourceRefs],
      segmentId: row.segmentId,
      directionId: row.directionId,
      segmentOrder: row.segmentOrder,
      matchMethod: row.matchMethod,
      overlapShare: row.overlapShare,
      laneTypes: laneTypesForSegmentRow(row),
    }));

  const routeTreatmentSourceGapFeatures = input.artifact.sourceGapRows
    .filter((row) => routeMatches(row.routeId, input.routeId))
    .map((row) => ({
      routeId: row.routeId,
      month: row.month,
      treatmentType: row.treatmentType,
      gapKind: row.gapKind,
      sourceRefs: [...row.sourceRefs],
      publicStatement: row.publicStatement,
      blocksClaims: [...row.blocksClaims],
    }));

  return {
    routeTreatmentFeatures,
    routeSegmentTreatmentFeatures,
    routeTreatmentSourceGapFeatures,
    summary: {
      sourceKind: "route_treatment_summary_artifact",
      artifactMonth: input.artifact.month,
      artifactValidationStatus: input.artifact.validation.status,
      routeFilter: input.routeId ?? null,
      routeTreatmentFeatureCount: routeTreatmentFeatures.length,
      routeSegmentTreatmentFeatureCount: routeSegmentTreatmentFeatures.length,
      routeTreatmentSourceGapFeatureCount: routeTreatmentSourceGapFeatures.length,
      sourceGapFeatureCount: routeTreatmentSourceGapFeatures.length,
      positiveSegmentTreatmentFeatureCount: routeSegmentTreatmentFeatures.filter(
        (feature) => feature.status === "current_confirmed" || feature.status === "implemented",
      ).length,
      routeTreatmentSourceEvidenceRowCount: input.artifact.source.inputs.sourceEvidenceRowCount,
      segmentUniverseRowCount: input.artifact.source.inputs.segmentUniverseRowCount,
      segmentTreatmentRowCount: input.artifact.source.inputs.segmentTreatmentRowCount,
    },
  };
}
