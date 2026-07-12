import type { StudyArtifact } from "../../src/studio/api-contract";

export const gatePass = { status: "pass", reason: "ok" } as const;

export function studyFixture(over: Partial<StudyArtifact> = {}): StudyArtifact {
  const variant = {
    effectMph: 0.22,
    effectPercent: 3.1,
    confidenceInterval: { lowerMph: 0.06, upperMph: 0.39, iterationCount: 1000, seed: 7 },
    windowMeans: {
      treatedPreMeanMph: 6.9,
      treatedPostMeanMph: 7.2,
      controlPreMeanMph: 6.9,
      controlPostMeanMph: 6.92,
    },
    matchedSegmentCount: 24,
    eligibleControlSegmentCount: 120,
    dropped: { insufficientWindow: 0, insufficientControls: 0, unmatchedSourceRows: 0 },
    monthlySeries: [
      { month: "2024-07", treatedMeanMph: 6.9, controlMeanMph: 6.9, differenceMph: 0 },
      { month: "2025-01", treatedMeanMph: 7.0, controlMeanMph: 6.9, differenceMph: 0.1 },
      { month: "2025-06", treatedMeanMph: 7.2, controlMeanMph: 6.92, differenceMph: 0.28 },
    ],
  };
  return {
    artifactKind: "bp.studio.segment_study.v1",
    schemaVersion: 1,
    eventKey: "study-event-abc",
    candidateId: "cand-1",
    candidateSetId: "cs-1",
    routeId: "B41",
    routeSlug: "b41",
    treatmentFamily: "automated_bus_lane_enforcement",
    implementationDate: "2024-09-16",
    implementationMonth: "2024-09",
    treatedSegmentScope: "all_route_spines",
    treatedSpineSegmentIds: [],
    evaluationLevel: "segment_matched_did",
    claimTier: "gated_estimate",
    direction: "improved",
    gates: {
      preTrend: gatePass,
      placeboInTime: gatePass,
      minSample: gatePass,
      controlEligibility: gatePass,
      congestionPricingOverlap: gatePass,
      redesignOverlap: gatePass,
    },
    variants: { allDay: variant, peakHours: variant },
    placeboEffectMph: null,
    sensitivityEstimates: { congestionPricing: null, queensRedesign: null },
    provenance: {
      engineVersion: "segment-matched-did-v1",
      event: [
        {
          sourceKind: "registry",
          sourceId: "mta_ace_routes",
          sourceEventId: "ace:B41:ACE:2024-09-16",
          releaseId: null,
          anchorIds: [],
        },
      ],
      sourceTable: "local_route_segment_speed",
      analysisMonth: "2026-03",
      dataWindow: { startMonth: "2024-07", endMonth: "2025-06" },
      speedSpineArtifactPaths: ["p"],
      excludedControlRouteIds: [],
    },
    ...over,
  };
}
