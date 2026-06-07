import { createHash } from "node:crypto";
import type {
  RouteSegmentTreatmentSummaryFeature,
  RouteTreatmentSourceGapFeature,
  RouteTreatmentSummaryFeature,
} from "@bp/analytics/features";

export type TreatmentReviewSegmentSpeedRow = {
  route_id: unknown;
  month: unknown;
  segment_id: unknown;
  direction: unknown;
  stop_order: unknown;
  average_speed_mph: unknown;
  observation_count: unknown;
  bus_trip_count: unknown;
};

export type TreatmentReviewCandidateKind =
  | "tsp_source_gap_blocker"
  | "bus_lane_slow_segment_review"
  | "treated_slow_route_review";

export type TreatmentReviewCandidate = {
  candidateId: string;
  candidateKind: TreatmentReviewCandidateKind;
  routeId: string;
  segmentId: string | null;
  treatmentType: string;
  score: number;
  claimSafeLabel: "insufficient_evidence" | "issue_needs_review";
  claimText: string;
  evidenceRefs: string[];
  blockers: string[];
  detectorPath: string;
};

type SegmentSpeedSummary = {
  averageSpeedMph: number;
  observationCount: number;
  busTripCount: number;
};

export type TreatmentDetectorReviewArtifact = {
  artifactKind: "treatment_detector_review";
  schemaVersion: 1;
  generatedAt: string;
  month: string;
  source: {
    artifactPath: string;
    speedRowCount: number;
    routeTreatmentFeatureCount: number;
    routeSegmentTreatmentFeatureCount: number;
    routeTreatmentSourceGapFeatureCount: number;
  };
  thresholds: TreatmentDetectorReviewThresholds;
  summary: {
    candidateCount: number;
    tspSourceGapBlockerCount: number;
    busLaneSlowSegmentReviewCount: number;
    treatedSlowRouteReviewCount: number;
  };
  candidates: TreatmentReviewCandidate[];
};

export type TreatmentDetectorReviewThresholds = {
  maxSlowSegmentSpeedMph: number;
  maxSlowRouteSpeedMph: number;
  minSegmentObservations: number;
  candidateLimitPerKind: number;
};

export const DEFAULT_TREATMENT_DETECTOR_REVIEW_THRESHOLDS: TreatmentDetectorReviewThresholds = {
  maxSlowSegmentSpeedMph: 6,
  maxSlowRouteSpeedMph: 7.5,
  minSegmentObservations: 50,
  candidateLimitPerKind: 25,
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function isPositiveTreatment(feature: RouteTreatmentSummaryFeature): boolean {
  return (
    feature.status === "current_confirmed" ||
    feature.status === "implemented" ||
    feature.status === "historical_confirmed"
  );
}

function routeAverages(rows: readonly TreatmentReviewSegmentSpeedRow[]): Map<string, number> {
  const sums = new Map<string, { speedTrips: number; trips: number }>();
  for (const row of rows) {
    const routeId = text(row.route_id);
    const speed = numberValue(row.average_speed_mph);
    const trips = numberValue(row.bus_trip_count);
    if (routeId === null || speed === null || trips === null || trips <= 0) continue;
    const current = sums.get(routeId) ?? { speedTrips: 0, trips: 0 };
    current.speedTrips += speed * trips;
    current.trips += trips;
    sums.set(routeId, current);
  }
  return new Map(
    [...sums.entries()].flatMap(([routeId, sum]) =>
      sum.trips > 0 ? [[routeId, sum.speedTrips / sum.trips]] : [],
    ),
  );
}

function segmentSpeedIndex(
  rows: readonly TreatmentReviewSegmentSpeedRow[],
): Map<string, SegmentSpeedSummary> {
  const output = new Map<string, SegmentSpeedSummary>();
  for (const row of rows) {
    const segmentId = text(row.segment_id);
    const averageSpeedMph = numberValue(row.average_speed_mph);
    const observationCount = numberValue(row.observation_count);
    const busTripCount = numberValue(row.bus_trip_count);
    if (
      segmentId === null ||
      averageSpeedMph === null ||
      observationCount === null ||
      busTripCount === null
    ) {
      continue;
    }
    output.set(segmentId, { averageSpeedMph, observationCount, busTripCount });
  }
  return output;
}

function scoreSlowSpeed(speed: number, ceiling: number): number {
  return Math.max(1, Math.min(100, Math.round(((ceiling - speed) / ceiling) * 100 + 50)));
}

export function buildTreatmentDetectorReviewArtifact(input: {
  month: string;
  generatedAt: string;
  artifactPath: string;
  routeTreatmentFeatures: readonly RouteTreatmentSummaryFeature[];
  routeSegmentTreatmentFeatures: readonly RouteSegmentTreatmentSummaryFeature[];
  routeTreatmentSourceGapFeatures: readonly RouteTreatmentSourceGapFeature[];
  speedRows: readonly TreatmentReviewSegmentSpeedRow[];
  thresholds?: Partial<TreatmentDetectorReviewThresholds>;
}): TreatmentDetectorReviewArtifact {
  const thresholds = {
    ...DEFAULT_TREATMENT_DETECTOR_REVIEW_THRESHOLDS,
    ...(input.thresholds ?? {}),
  };
  const routeSpeedByRoute = routeAverages(input.speedRows);
  const speedBySegment = segmentSpeedIndex(input.speedRows);

  const tspSourceGapCandidates = input.routeTreatmentSourceGapFeatures
    .filter(
      (feature) =>
        feature.treatmentType === "transit_signal_priority" &&
        feature.gapKind === "current_inventory_missing" &&
        feature.routeId !== null,
    )
    .map((feature) => {
      const routeId = feature.routeId ?? "";
      const routeSpeed = routeSpeedByRoute.get(routeId);
      return {
        feature,
        routeId,
        routeSpeed,
        sortScore: routeSpeed === undefined ? 0 : scoreSlowSpeed(routeSpeed, thresholds.maxSlowRouteSpeedMph),
      };
    })
    .filter((row) => row.routeId.length > 0 && row.routeSpeed !== undefined)
    .filter((row) => (row.routeSpeed ?? Number.POSITIVE_INFINITY) <= thresholds.maxSlowRouteSpeedMph)
    .sort(
      (left, right) =>
        right.sortScore - left.sortScore ||
        (left.routeSpeed ?? 0) - (right.routeSpeed ?? 0) ||
        left.routeId.localeCompare(right.routeId),
    )
    .slice(0, thresholds.candidateLimitPerKind)
    .map<TreatmentReviewCandidate>((row) => ({
      candidateId: stableId(input.month, "tsp_source_gap_blocker", row.routeId),
      candidateKind: "tsp_source_gap_blocker",
      routeId: row.routeId,
      segmentId: null,
      treatmentType: "transit_signal_priority",
      score: row.sortScore,
      claimSafeLabel: "insufficient_evidence",
      claimText: `Route ${row.routeId} is slow enough to review, but current public route/intersection TSP inventory is missing; do not claim TSP absence.`,
      evidenceRefs: uniqueSorted(row.feature.sourceRefs),
      blockers: [...row.feature.blocksClaims],
      detectorPath: "source_gap -> TSP current-inventory blocker",
    }));

  const busLaneSlowSegmentCandidates = input.routeSegmentTreatmentFeatures
    .filter(
      (feature) =>
        feature.treatmentType === "bus_lane" &&
        feature.status === "current_confirmed" &&
        feature.matchMethod === "route_shape_overlap",
    )
    .map((feature) => ({ feature, speed: speedBySegment.get(feature.segmentId) }))
    .filter(
      (row): row is { feature: RouteSegmentTreatmentSummaryFeature; speed: SegmentSpeedSummary } =>
        row.speed !== undefined &&
        row.speed.observationCount >= thresholds.minSegmentObservations &&
        row.speed.averageSpeedMph <= thresholds.maxSlowSegmentSpeedMph,
    )
    .sort(
      (left, right) =>
        left.speed.averageSpeedMph - right.speed.averageSpeedMph ||
        (right.feature.overlapShare ?? 0) - (left.feature.overlapShare ?? 0) ||
        left.feature.routeId.localeCompare(right.feature.routeId),
    )
    .slice(0, thresholds.candidateLimitPerKind)
    .map<TreatmentReviewCandidate>((row) => ({
      candidateId: stableId(input.month, "bus_lane_slow_segment_review", row.feature.segmentId),
      candidateKind: "bus_lane_slow_segment_review",
      routeId: row.feature.routeId,
      segmentId: row.feature.segmentId,
      treatmentType: "bus_lane",
      score: scoreSlowSpeed(row.speed.averageSpeedMph, thresholds.maxSlowSegmentSpeedMph),
      claimSafeLabel: "issue_needs_review",
      claimText: `Route ${row.feature.routeId} segment ${row.feature.segmentId} has bus-lane overlap and ${row.speed.averageSpeedMph.toFixed(1)} mph observed speed; review treatment geometry, enforcement, and peer context before calling it underperformance.`,
      evidenceRefs: uniqueSorted([
        ...row.feature.sourceRefs,
        `local_route_segment_speed_segment:${row.feature.segmentId}`,
      ]),
      blockers: [
        "Needs peer/daypart baseline before underperformance language.",
        "Bus-lane overlap is geometry context, not audited lane-mile inventory.",
      ],
      detectorPath: "intervention_underperformance -> segment bus-lane slow-segment review",
    }));

  const treatedSlowRouteCandidates = input.routeTreatmentFeatures
    .filter((feature) => isPositiveTreatment(feature))
    .filter(
      (feature) =>
        feature.treatmentType !== "transit_signal_priority" &&
        feature.treatmentType !== "custom_treatment",
    )
    .map((feature) => ({ feature, routeSpeed: routeSpeedByRoute.get(feature.routeId) }))
    .filter(
      (row): row is { feature: RouteTreatmentSummaryFeature; routeSpeed: number } =>
        row.routeSpeed !== undefined && row.routeSpeed <= thresholds.maxSlowRouteSpeedMph,
    )
    .sort(
      (left, right) =>
        left.routeSpeed - right.routeSpeed ||
        left.feature.routeId.localeCompare(right.feature.routeId) ||
        left.feature.treatmentType.localeCompare(right.feature.treatmentType),
    )
    .slice(0, thresholds.candidateLimitPerKind)
    .map<TreatmentReviewCandidate>((row) => ({
      candidateId: stableId(
        input.month,
        "treated_slow_route_review",
        row.feature.routeId,
        row.feature.treatmentType,
      ),
      candidateKind: "treated_slow_route_review",
      routeId: row.feature.routeId,
      segmentId: null,
      treatmentType: row.feature.treatmentType,
      score: scoreSlowSpeed(row.routeSpeed, thresholds.maxSlowRouteSpeedMph),
      claimSafeLabel: "issue_needs_review",
      claimText: `Route ${row.feature.routeId} has ${row.feature.treatmentType} evidence and ${row.routeSpeed.toFixed(1)} mph route speed; review whether this is an intervention-gap, underperformance, or scope-mismatch case.`,
      evidenceRefs: uniqueSorted(row.feature.sourceRefs),
      blockers: [
        "Needs before/after or peer-adjusted panel before effect language.",
        "Route-level treatment evidence may not cover the slowest segment.",
      ],
      detectorPath: "intervention_gap/intervention_underperformance -> route treatment-pain review",
    }));

  const candidates = [
    ...busLaneSlowSegmentCandidates,
    ...treatedSlowRouteCandidates,
    ...tspSourceGapCandidates,
  ];

  return {
    artifactKind: "treatment_detector_review",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    month: input.month,
    source: {
      artifactPath: input.artifactPath,
      speedRowCount: input.speedRows.length,
      routeTreatmentFeatureCount: input.routeTreatmentFeatures.length,
      routeSegmentTreatmentFeatureCount: input.routeSegmentTreatmentFeatures.length,
      routeTreatmentSourceGapFeatureCount: input.routeTreatmentSourceGapFeatures.length,
    },
    thresholds,
    summary: {
      candidateCount: candidates.length,
      tspSourceGapBlockerCount: tspSourceGapCandidates.length,
      busLaneSlowSegmentReviewCount: busLaneSlowSegmentCandidates.length,
      treatedSlowRouteReviewCount: treatedSlowRouteCandidates.length,
    },
    candidates,
  };
}

export function treatmentDetectorReviewMarkdown(
  artifact: TreatmentDetectorReviewArtifact,
): string {
  const lines = [
    `# Treatment Detector Review (${artifact.month})`,
    "",
    `Generated: ${artifact.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Candidates: ${artifact.summary.candidateCount.toLocaleString("en-US")}`,
    `- Bus-lane slow segment review: ${artifact.summary.busLaneSlowSegmentReviewCount.toLocaleString("en-US")}`,
    `- Treated slow route review: ${artifact.summary.treatedSlowRouteReviewCount.toLocaleString("en-US")}`,
    `- TSP source-gap blockers: ${artifact.summary.tspSourceGapBlockerCount.toLocaleString("en-US")}`,
    `- Route treatment features: ${artifact.source.routeTreatmentFeatureCount.toLocaleString("en-US")}`,
    `- Segment treatment features: ${artifact.source.routeSegmentTreatmentFeatureCount.toLocaleString("en-US")}`,
    `- Source-gap treatment features: ${artifact.source.routeTreatmentSourceGapFeatureCount.toLocaleString("en-US")}`,
    "",
    "## Candidate Samples",
    "",
    ...artifact.candidates.slice(0, 30).map((candidate) =>
      [
        `- ${candidate.candidateKind} ${candidate.routeId}${candidate.segmentId === null ? "" : ` ${candidate.segmentId}`}: ${candidate.claimText}`,
        `  - score: ${candidate.score}; detector path: ${candidate.detectorPath}`,
      ].join("\n"),
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
