import { describe, expect, test } from "bun:test";
import {
  FindingReasonCodeSchema,
  type RouteMonthSignalFeature,
  RouteMonthSignalFeatureSchema,
} from "@bp/domain";
import { detectPermitCorrelatedSlowdowns } from "../src/index.js";

const GENERATED_AT = "2026-05-20T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "permit0123456789abcdef0123456789";

function baseFeature(overrides: Partial<RouteMonthSignalFeature> = {}): RouteMonthSignalFeature {
  return RouteMonthSignalFeatureSchema.parse({
    scope: "route",
    scopeId: "M15",
    routeId: "M15",
    month: MONTH,
    window: "all_day",
    direction: null,
    routeWeightedAverageSpeedMph: 5.1,
    speedObservationCount: 900,
    hotspotCount: 4,
    maxHotspotScore: 91,
    ridershipExposure: 125_000,
    permitTouchedEventCount: 42,
    permitTouchCount: 120,
    permitRouteCount: 1,
    permitSources: ["nyc_dot_street_construction_permits"],
    contextTouchedEventCount: 42,
    contextTouchCount: 120,
    contextPrimaryTouchCount: 0,
    contextHighConfidenceTouchCount: 42,
    contextEventCounts: [
      {
        sourceId: "nyc_dot_street_construction_permits",
        eventKind: "permit",
        touchedEventCount: 42,
        touchCount: 120,
        primaryTouchCount: 0,
        contextTouchCount: 120,
        highConfidenceTouchCount: 42,
        matchWeightSum: 42,
        averageMatchWeight: 1,
        maxRouteFanout: 1,
      },
    ],
    sampleSupport: 900,
    uncertainty: {
      speedObservationCount: 900,
      permitTouchedEventCount: 42,
      contextTouchedEventCount: 42,
      contextHighConfidenceTouchCount: 42,
    },
    provenance: {
      featureComputedAt: GENERATED_AT,
      derivationVersion: "route_month_signal_features.v1",
      sourceRefs: ["local_route_hotspot_summary:M15:2026-03"],
    },
    coverage: {
      isComputable: true,
      skippedReasonCode: null,
      inputsSeenJson: "{}",
      inputsExpectedJson: "{}",
    },
    ...overrides,
  });
}

describe("detectPermitCorrelatedSlowdowns", () => {
  test("emits route finding when slow speed and permit touches coincide", () => {
    const output = detectPermitCorrelatedSlowdowns({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      features: [baseFeature()],
    });

    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0]?.detectorId as string).toBe("permit_correlated_slowdown");
    expect(output.candidates[0]?.reasonCode as string).toBe("permit_correlated_slowdown");
    expect(output.candidates[0]?.category as string).toBe("context");
    expect(output.evidence).toHaveLength(2);
    expect(output.evidence.map((link) => link.evidenceRole as string).sort()).toEqual([
      "counter_evidence",
      "primary",
    ]);
    expect(JSON.parse(output.evidence[0]?.evidenceRef ?? "{}")).toMatchObject({
      routeId: "M15",
      window: "all_day",
      permitTouchedEventCount: 42,
      provenance: {
        derivationVersion: "route_month_signal_features.v1",
      },
    });
    expect(output.coverage[0]?.outcome as string).toBe("hit");
  });

  test("does not emit when permit support is too thin", () => {
    const output = detectPermitCorrelatedSlowdowns({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      features: [baseFeature({ permitTouchedEventCount: 3, permitTouchCount: 8 })],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]?.outcome as string).toBe("clean_no_hit");
    expect(output.coverage[0]?.reasonCode as string).toBe("insufficient_permit_touches");
  });

  test("keeps missing feature inputs as skipped coverage", () => {
    const output = detectPermitCorrelatedSlowdowns({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      features: [
        baseFeature({
          coverage: {
            isComputable: false,
            skippedReasonCode: FindingReasonCodeSchema.parse("missing_speed"),
            inputsSeenJson: "{}",
            inputsExpectedJson: "{}",
          },
        }),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]?.outcome as string).toBe("skipped_missing_input");
    expect(output.coverage[0]?.reasonCode as string).toBe("missing_speed");
  });
});
