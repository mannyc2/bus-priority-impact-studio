import { describe, expect, test } from "bun:test";
import {
  detectInterventionEventStudies,
  type InterventionEventStudyDetectorInput,
} from "../src/index.js";
import type { FeatureQuality, InterventionPanelFeature } from "@bp/analytics/features";

const GENERATED_AT = "2026-05-30T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "eventstudy0123456789abcdef";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 12,
    expectedCount: 12,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 12,
    minSampleCount: 6,
    sampleStatus: "supported",
    ...over,
  };
}

function panel(over: Partial<InterventionPanelFeature> = {}): InterventionPanelFeature {
  return {
    eventId: "ace-m15-2026",
    interventionType: "ace",
    treatedScopeKind: "route",
    treatedScopeId: "M15",
    interventionDate: "2026-03-01",
    preWindowStart: "2025-12",
    preWindowEnd: "2026-02",
    postWindowStart: "2026-03",
    postWindowEnd: "2026-05",
    controlScopeIds: ["M14", "M101", "M102"],
    controlEligibilityStatus: "eligible",
    preTrendStatus: "passes",
    placeboStatus: "passes",
    placeboInTimeStatus: "passes",
    placeboInSpaceStatus: "passes",
    autocorrelationStatus: "passes",
    methodDivergenceStatus: "passes",
    eventStudyEstimate: 0.12,
    eventStudyConfidenceIntervalLow: 0.04,
    eventStudyConfidenceIntervalHigh: 0.2,
    matchedPeerDelta: 0.1,
    syntheticControlGap: 0.11,
    quality: quality(),
    ...over,
  };
}

function runEventStudy(
  row: InterventionPanelFeature,
  over: Partial<InterventionEventStudyDetectorInput> = {},
) {
  return detectInterventionEventStudies({
    detectorRunId: RUN_ID,
    month: MONTH,
    generatedAt: GENERATED_AT,
    features: [row],
    ...over,
  });
}

describe("detectInterventionEventStudies", () => {
  test("emits association candidates with candidate-causal gate metadata when all gates pass", () => {
    const out = runEventStudy(panel());

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.detectorId as string).toBe("intervention_event_study");
    expect(out.candidates[0]?.reasonCode as string).toBe("intervention_association");
    expect(out.candidates[0]?.claimText).toContain("association pending review");
    const primary = out.evidence.find((link) => (link.evidenceRole as string) === "primary");
    const payload = JSON.parse(primary?.evidenceRef ?? "{}") as {
      claimStrengthTier?: string;
      gateSummary?: { candidateCausalEligible?: boolean };
    };
    expect(payload.claimStrengthTier).toBe("candidate_causal_needs_review");
    expect(payload.gateSummary?.candidateCausalEligible).toBe(true);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("keeps failed gates associational and records blocking reasons", () => {
    const out = runEventStudy(panel({ preTrendStatus: "fails" }));

    expect(out.candidates).toHaveLength(1);
    const primary = out.evidence.find((link) => (link.evidenceRole as string) === "primary");
    const payload = JSON.parse(primary?.evidenceRef ?? "{}") as {
      claimStrengthTier?: string;
      gateSummary?: { blockingReasons?: string[] };
    };
    expect(payload.claimStrengthTier).toBe("associational");
    expect(payload.gateSummary?.blockingReasons).toEqual(["pre_trend_failed"]);
  });

  test("skips panels without a counterfactual", () => {
    const out = runEventStudy(
      panel({ controlEligibilityStatus: "insufficient_controls", controlScopeIds: [] }),
    );

    expect(out.candidates).toHaveLength(0);
    expect(out.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(out.coverage[0]?.reasonCode as string).toBe("no_counterfactual");
  });
});
