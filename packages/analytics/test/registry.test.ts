import { describe, expect, test } from "bun:test";
import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
  DEGRADATION_TREND_DETECTOR_ID,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  SOURCE_GAP_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
} from "@bp/analytics/detectors";
import {
  ANALYTICS_DETECTOR_REGISTRY,
  DETECTOR_BASELINE_FAMILIES,
  DETECTOR_CLAIM_TIERS,
  DETECTOR_PROMOTION_GATE_KINDS,
  DETECTOR_RETIREMENT_STATUSES,
  FINDING_DETECTOR_SPECS,
  assertDetectorRegistryMatchesSpecs,
  buildFindingDetectorSpecsArtifact,
  getAnalyticsDetector,
  getFindingDetectorSpec,
  listAnalyticsDetectors,
} from "@bp/analytics/registry";

const EXPECTED_DETECTOR_IDS = [
  SOURCE_GAP_DETECTOR_ID,
  PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
  SPEED_PACE_HOTSPOT_DETECTOR_ID,
  MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
  OBSERVED_RELIABILITY_DETECTOR_ID,
  HEADWAY_RELIABILITY_EWT_DETECTOR_ID,
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID,
  TRAVEL_TIME_VARIABILITY_DETECTOR_ID,
  SCHEDULE_MISMATCH_DETECTOR_ID,
  DEGRADATION_TREND_DETECTOR_ID,
  POSITIVE_DEVIANCE_DETECTOR_ID,
  INTERVENTION_GAP_DETECTOR_ID,
  INTERVENTION_EVENT_STUDY_DETECTOR_ID,
  INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID,
  PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
  SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
] as const;

describe("analytics detector registry", () => {
  test("registers every detector spec exactly once", () => {
    expect(() => assertDetectorRegistryMatchesSpecs()).not.toThrow();

    const registeredIds = ANALYTICS_DETECTOR_REGISTRY.map((detector) => detector.detectorId);
    expect(registeredIds).toEqual(EXPECTED_DETECTOR_IDS);
    expect(new Set(registeredIds).size).toBe(registeredIds.length);
    expect(FINDING_DETECTOR_SPECS.map((spec) => spec.detectorId).sort()).toEqual(
      [...EXPECTED_DETECTOR_IDS].sort(),
    );
  });

  test("returns defensive registry copies and detector lookup results", () => {
    const copy = listAnalyticsDetectors();
    copy.pop();

    expect(copy).toHaveLength(ANALYTICS_DETECTOR_REGISTRY.length - 1);
    expect(listAnalyticsDetectors()).toHaveLength(ANALYTICS_DETECTOR_REGISTRY.length);
    expect(getAnalyticsDetector(PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID)?.scope.kind).toBe("segment");
    expect(getAnalyticsDetector("unknown_detector")).toBeNull();
  });

  test("keeps detector metadata useful for agent-facing design and review", () => {
    const claimTiers = new Set<string>(DETECTOR_CLAIM_TIERS);
    const baselineFamilies = new Set<string>(DETECTOR_BASELINE_FAMILIES);
    const gateKinds = new Set<string>(DETECTOR_PROMOTION_GATE_KINDS);
    const retirementStatuses = new Set<string>(DETECTOR_RETIREMENT_STATUSES);

    for (const detector of ANALYTICS_DETECTOR_REGISTRY) {
      expect(detector.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(detector.featureGrains.length).toBeGreaterThan(0);
      expect(detector.spec.detectorId).toBe(detector.detectorId);
      expect(detector.spec.primaryEvidenceRequired.length).toBeGreaterThan(0);
      expect(detector.spec.counterEvidenceRequired.length).toBeGreaterThan(0);
      expect(detector.spec.knownFailureModes.length).toBeGreaterThan(0);
      expect(claimTiers.has(detector.claimTier)).toBe(true);
      expect(detector.baselineFamilies.length).toBeGreaterThan(0);
      expect(new Set(detector.baselineFamilies).size).toBe(detector.baselineFamilies.length);
      expect(detector.baselineFamilies.every((family) => baselineFamilies.has(family))).toBe(true);
      expect(detector.promotionGates.length).toBeGreaterThan(0);
      for (const gate of detector.promotionGates) {
        expect(gateKinds.has(gate.kind)).toBe(true);
        expect(gate.description.length).toBeGreaterThan(0);
        expect(gate.requiredFor.length).toBeGreaterThan(0);
        expect(gate.requiredFor.every((tier) => claimTiers.has(tier))).toBe(true);
      }
      expect(detector.missingDataStates.length).toBeGreaterThan(0);
      expect(detector.evidenceSchemaVersion).toMatch(/^v\d+$/);
      expect(retirementStatuses.has(detector.retirementStatus)).toBe(true);
      expect(typeof detector.run).toBe("function");
    }
  });

  test("classifies current detectors by safe claim tier", () => {
    expect(getAnalyticsDetector(SOURCE_GAP_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(OBSERVED_RELIABILITY_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(HEADWAY_RELIABILITY_EWT_DETECTOR_ID)?.claimTier).toBe(
      "descriptive",
    );
    expect(getAnalyticsDetector(BUNCHING_HOTSPOTS_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID)?.claimTier).toBe(
      "associational",
    );
    expect(getAnalyticsDetector(PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID)?.claimTier).toBe(
      "descriptive",
    );
    expect(getAnalyticsDetector(SPEED_PACE_HOTSPOT_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(TRAVEL_TIME_VARIABILITY_DETECTOR_ID)?.claimTier).toBe(
      "descriptive",
    );
    expect(getAnalyticsDetector(SCHEDULE_MISMATCH_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(DEGRADATION_TREND_DETECTOR_ID)?.claimTier).toBe("associational");
    expect(getAnalyticsDetector(POSITIVE_DEVIANCE_DETECTOR_ID)?.claimTier).toBe("descriptive");
    expect(getAnalyticsDetector(PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID)?.claimTier).toBe(
      "associational",
    );
    expect(getAnalyticsDetector(INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID)?.claimTier).toBe(
      "associational",
    );
    expect(getAnalyticsDetector(INTERVENTION_EVENT_STUDY_DETECTOR_ID)?.claimTier).toBe(
      "associational",
    );
    expect(
      ANALYTICS_DETECTOR_REGISTRY.some(
        (detector) => detector.claimTier === "candidate_causal_needs_review",
      ),
    ).toBe(false);
  });

  test("builds a schema-validated detector-spec artifact", () => {
    const artifact = buildFindingDetectorSpecsArtifact({
      generatedAt: "2026-05-30T00:00:00.000Z",
    });

    expect(artifact.artifactKind).toBe("finding_detector_specs");
    expect(artifact.detectorCount).toBe(EXPECTED_DETECTOR_IDS.length);
    expect(artifact.detectors.map((spec) => spec.detectorId)).toEqual(EXPECTED_DETECTOR_IDS);
    expect(getFindingDetectorSpec(DELAY_CONCENTRATION_DETECTOR_ID)?.allowedClaimStrength).toBe(2);
  });
});
