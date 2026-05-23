import { describe, expect, test } from "bun:test";
import { type RouteMonthSignalFeature, RouteMonthSignalFeatureSchema } from "@bp/domain";
import { detectServiceRequestContext } from "../src/findings/service-request-context.js";

const RUN_ID = "service-request-context-test-run";
const GENERATED_AT = "2026-05-23T00:00:00.000Z";

function feature(overrides: Partial<RouteMonthSignalFeature> = {}): RouteMonthSignalFeature {
  return RouteMonthSignalFeatureSchema.parse({
    scope: "route",
    scopeId: "M15",
    routeId: "M15",
    month: "2026-03",
    window: "all_day",
    direction: null,
    routeWeightedAverageSpeedMph: 5.4,
    speedObservationCount: 600,
    hotspotCount: 1,
    maxHotspotScore: 82,
    ridershipExposure: 10000,
    permitTouchedEventCount: 0,
    permitTouchCount: 0,
    permitRouteCount: 0,
    permitSources: [],
    contextTouchedEventCount: 40,
    contextTouchCount: 40,
    contextPrimaryTouchCount: 0,
    contextHighConfidenceTouchCount: 12,
    contextEventCounts: [
      {
        sourceId: "nyc_311_service_requests_current",
        eventKind: "311_complaint",
        touchedEventCount: 40,
        touchCount: 40,
        primaryTouchCount: 0,
        contextTouchCount: 40,
        highConfidenceTouchCount: 12,
        matchWeightSum: 34,
        averageMatchWeight: 0.85,
        maxRouteFanout: 2,
      },
    ],
    sampleSupport: 600,
    uncertainty: {
      speedObservationCount: 600,
      permitTouchedEventCount: 0,
      contextTouchedEventCount: 40,
      contextHighConfidenceTouchCount: 12,
    },
    provenance: {
      featureComputedAt: GENERATED_AT,
      derivationVersion: "route_month_signal_features.v1",
      sourceRefs: ["fixture"],
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

describe("service-request-context detector", () => {
  test("emits a conservative context candidate with counter-evidence", () => {
    const output = detectServiceRequestContext({
      detectorRunId: RUN_ID,
      month: "2026-03",
      generatedAt: GENERATED_AT,
      features: [feature()],
    });

    expect(output.candidates).toHaveLength(1);
    expect(output.candidates[0]).toMatchObject({
      detectorId: "service_request_context",
      routeId: "M15",
      reasonCode: "service_request_context_slowdown",
      claimSafeLabel: "issue_needs_review",
      category: "context",
    });
    expect(output.coverage[0]).toMatchObject({
      outcome: "hit",
      reasonCode: null,
    });
    expect(output.evidence.map((link) => link.evidenceRole as string)).toEqual([
      "primary",
      "context",
      "counter_evidence",
    ]);
  });

  test("requires substantial 311 support before firing", () => {
    const output = detectServiceRequestContext({
      detectorRunId: RUN_ID,
      month: "2026-03",
      generatedAt: GENERATED_AT,
      features: [
        feature({
          contextTouchedEventCount: 2,
          contextTouchCount: 2,
          contextHighConfidenceTouchCount: 0,
          contextEventCounts: [
            {
              sourceId: "nyc_311_service_requests_current",
              eventKind: "311_complaint",
              touchedEventCount: 2,
              touchCount: 2,
              primaryTouchCount: 0,
              contextTouchCount: 2,
              highConfidenceTouchCount: 0,
              matchWeightSum: 0.4,
              averageMatchWeight: 0.2,
              maxRouteFanout: 9,
            },
          ],
        }),
      ],
    });

    expect(output.candidates).toHaveLength(0);
    expect(output.coverage[0]).toMatchObject({
      outcome: "clean_no_hit",
      reasonCode: "insufficient_service_request_context",
    });
  });
});
