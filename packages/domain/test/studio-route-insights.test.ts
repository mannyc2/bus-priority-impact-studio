import { describe, expect, test } from "bun:test";
import {
  buildRouteInsightsFromDetectorReadiness,
  type DetectorReadinessServingManifestForInsights,
  SERVING_BLOCKED_DETECTOR_IDS,
  STUDIO_ROUTE_INSIGHT_DETECTOR_IDS,
  StudioRouteDetailResponseSchema,
} from "../src/studio";

const manifest = {
  artifactKind: "detector_readiness_serving_manifest",
  schemaVersion: 1,
  routes: [
    {
      routeId: "B47",
      counts: {
        public_finding_candidate: 2,
        route_context: 1,
        review_queue: 2,
        suppressed: 3,
      },
      publicFindingCandidateRefs: [
        {
          detectorId: "customer_journey_shortfall",
          routeId: "B47",
          scopeId: "B47:2026-04:Peak:LCL/LTD",
          month: "2026-04",
          asOfMonth: "2026-04",
          bucket: "public_finding_candidate",
          evidenceRefPath: "cjtp.json#scope:peak",
          sourceProjectionPath: "cjtp.json",
          readinessReason: "primary_finding; true_customer_impact; wait_component_driven",
          caveats: ["true_customer_impact", "wait_component_driven"],
        },
        {
          detectorId: "customer_journey_shortfall",
          routeId: "B47",
          scopeId: "B47:2026-04:Off-Peak:LCL/LTD",
          month: "2026-04",
          asOfMonth: "2026-04",
          bucket: "public_finding_candidate",
          evidenceRefPath: "cjtp.json#scope:off-peak",
          sourceProjectionPath: "cjtp.json",
          readinessReason: "primary_finding; true_customer_impact; wait_component_driven",
          caveats: ["true_customer_impact", "wait_component_driven"],
        },
        {
          detectorId: "treatment_scope_mismatch",
          routeId: "B47",
          scopeId: "B47:2026-03:S:1:stop-a:stop-b",
          month: "2026-03",
          asOfMonth: null,
          bucket: "public_finding_candidate",
          evidenceRefPath: "treatment.json#scope:mismatch",
          sourceProjectionPath: "treatment.json",
          readinessReason: "primary_finding; mismatch_overlap_confirmed",
          caveats: ["mismatch_overlap_confirmed", "not_terminal", "surprise_public_token"],
        },
      ],
      routeContextRefs: [
        {
          detectorId: "treatment_scope_gap",
          routeId: "B47",
          scopeId: "B47:2026-03:S:2:stop-c:stop-d",
          month: "2026-03",
          asOfMonth: null,
          bucket: "route_context",
          evidenceRefPath: "treatment.json#scope:gap-context",
          sourceProjectionPath: "treatment.json",
          readinessReason: "route_context; fit_status:true_uncovered",
          caveats: ["fit_status:true_uncovered", "moderate_speed_or_history_caveat"],
        },
      ],
      reviewQueueCounts: { customer_journey_shortfall: 2 },
      suppressedCounts: { customer_journey_shortfall: 3 },
    },
    {
      routeId: "Q1",
      publicFindingCandidateRefs: [
        {
          detectorId: "unknown_detector",
          routeId: "Q1",
          scopeId: "Q1:unknown",
          month: "2026-03",
          asOfMonth: null,
          bucket: "public_finding_candidate",
          caveats: ["surprise_token"],
        },
      ],
      routeContextRefs: [
        {
          detectorId: "customer_journey_shortfall",
          routeId: "Q1",
          scopeId: "Q1:2026-04:Peak:LCL/LTD",
          month: "2026-04",
          asOfMonth: "2026-04",
          bucket: "route_context",
          caveats: ["composite_metric_ambiguous", "route_rollup_artifact"],
        },
      ],
    },
  ],
} satisfies DetectorReadinessServingManifestForInsights;

const expectedFrontendDetectorIds = [
  "source_gap",
  "persistent_speed_hotspot",
  "speed_pace_hotspot",
  "multi_month_speed_peer",
  "observed_reliability",
  "headway_reliability_ewt",
  "bunching_hotspots",
  "rider_weighted_excess_wait",
  "customer_journey_shortfall",
  "travel_time_variability",
  "schedule_mismatch",
  "degradation_trend",
  "positive_deviance",
  "intervention_gap",
  "intervention_event_study",
  "intervention_underperformance",
  "treatment_scope_mismatch",
  "treatment_scope_gap",
  "permit_correlated_slowdown",
  "service_request_context",
  "delay_concentration",
] as const;

function scopeForDetector(detectorId: string): string {
  if (detectorId === "customer_journey_shortfall") return "M20:2026-03:Peak:LCL/LTD";
  if (
    detectorId === "speed_pace_hotspot" ||
    detectorId === "persistent_speed_hotspot" ||
    detectorId === "treatment_scope_mismatch" ||
    detectorId === "treatment_scope_gap"
  ) {
    return "M20:2026-03:N:3:stop-a:stop-b";
  }
  return `M20:2026-03:${detectorId}`;
}

function servingRef(detectorId: string) {
  return {
    detectorId,
    routeId: "M20",
    scopeId: scopeForDetector(detectorId),
    month: "2026-03",
    asOfMonth: "2026-03",
    bucket: "public_finding_candidate" as const,
    evidenceRefPath: `${detectorId}.json#scope`,
    sourceProjectionPath: `${detectorId}.json`,
    readinessReason: "primary_finding",
    caveats: [],
  };
}

describe("route insight projection", () => {
  test("projects every supported detector family into a frontend-safe insight", () => {
    expect(STUDIO_ROUTE_INSIGHT_DETECTOR_IDS).toEqual(expectedFrontendDetectorIds);

    const allDetectorManifest = {
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      routes: [
        {
          routeId: "M20",
          publicFindingCandidateRefs: STUDIO_ROUTE_INSIGHT_DETECTOR_IDS.map((detectorId) =>
            servingRef(detectorId),
          ),
          routeContextRefs: [],
        },
      ],
    } satisfies DetectorReadinessServingManifestForInsights;

    const insights = buildRouteInsightsFromDetectorReadiness({
      manifest: allDetectorManifest,
      routeId: "M20",
    });

    const servableDetectorIds = expectedFrontendDetectorIds.filter(
      (detectorId) => !(SERVING_BLOCKED_DETECTOR_IDS as readonly string[]).includes(detectorId),
    );
    expect([...new Set(insights.map((insight) => insight.detectorId))].sort()).toEqual(
      [...servableDetectorIds].sort(),
    );
    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detectorId: "speed_pace_hotspot",
          kind: "map_segment",
          placement: "map_segment",
          title: "Segment pace hotspot",
          target: {
            segmentIds: ["M20:2026-03:N:3:stop-a:stop-b", "M20+:2026-03:N:3:stop-a:stop-b"],
            direction: "N",
            segmentIndex: 3,
            fromNodeId: "stop-a",
            toNodeId: "stop-b",
          },
        }),
        expect.objectContaining({
          detectorId: "observed_reliability",
          kind: "performance_annotation",
          placement: "overview",
          title: "Observed reliability risk",
        }),
        expect.objectContaining({
          detectorId: "permit_correlated_slowdown",
          kind: "timeline_annotation",
          placement: "timeline",
          title: "Permit-correlated slowdown context",
        }),
        expect.objectContaining({
          detectorId: "source_gap",
          kind: "performance_annotation",
          placement: "chart_annotation",
          title: "Data source gap",
        }),
      ]),
    );
    expect(JSON.stringify(insights)).not.toContain("readinessReason");
    expect(JSON.stringify(insights)).not.toContain("public_finding_candidate");
  });

  test("turns public detector refs into human-facing route insights", () => {
    const insights = buildRouteInsightsFromDetectorReadiness({ manifest, routeId: "B47" });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "customer_journey",
          placement: "overview",
          severity: "high",
          title: "Customer journey shortfall",
          shortText:
            "Customer journey shortfall appears in peak and off-peak service, mainly on the wait-time side.",
          detectorId: "customer_journey_shortfall",
          refs: [
            { evidenceRefPath: "cjtp.json#scope:peak", sourceProjectionPath: "cjtp.json" },
            { evidenceRefPath: "cjtp.json#scope:off-peak", sourceProjectionPath: "cjtp.json" },
          ],
        }),
        expect.objectContaining({
          kind: "treatment_scope",
          placement: "map_segment",
          title: "Treatment segment underperformance",
          shortText: "Bus-priority treatment overlaps here, but this segment still underperforms.",
          scopeId: "B47:2026-03:S:1:stop-a:stop-b",
          target: {
            segmentIds: ["B47:2026-03:S:1:stop-a:stop-b", "B47+:2026-03:S:1:stop-a:stop-b"],
            direction: "S",
            segmentIndex: 1,
            fromNodeId: "stop-a",
            toNodeId: "stop-b",
          },
        }),
      ]),
    );
    expect(JSON.stringify(insights)).not.toContain("review_queue");
    expect(JSON.stringify(insights)).not.toContain("suppressed");
    expect(JSON.stringify(insights)).not.toContain("detector hit");
    expect(JSON.stringify(insights)).not.toContain("surprise_public_token");
    expect(JSON.stringify(insights)).not.toContain("Internal caveat");
  });

  test("keeps route-context refs soft and can omit them by caller choice", () => {
    const withContext = buildRouteInsightsFromDetectorReadiness({ manifest, routeId: "B47" });
    expect(withContext).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Treatment coverage context",
          placement: "chart_annotation",
          severity: "low",
          shortText:
            "A slow segment adds context for treatment coverage, but the evidence is caveated.",
        }),
      ]),
    );

    const publicOnly = buildRouteInsightsFromDetectorReadiness({
      manifest,
      routeId: "B47",
      includeRouteContext: false,
    });
    expect(publicOnly.some((insight) => insight.title === "Treatment coverage context")).toBe(
      false,
    );
  });

  test("maps caveat tokens to readable labels and fails closed for unknown detectors", () => {
    const b47 = buildRouteInsightsFromDetectorReadiness({ manifest, routeId: "B47" });
    expect(b47[0]?.caveatsForTooltip).toContain("Wait-time evidence is the main contributor.");

    const q1 = buildRouteInsightsFromDetectorReadiness({ manifest, routeId: "Q1" });
    expect(q1).toEqual([
      expect.objectContaining({
        title: "Customer journey context",
        shortText:
          "Customer journey evidence adds context for peak service, with component attribution still caveated.",
        caveatsForTooltip: expect.arrayContaining([
          "Composite metric attribution is not fully separable.",
          "Route-level rollup may hide more specific period or segment detail.",
        ]),
      }),
    ]);
    expect(q1.some((insight) => insight.detectorId === "unknown_detector")).toBe(false);
  });

  test("route detail contract defaults insights for older artifacts", () => {
    const detail = StudioRouteDetailResponseSchema.parse({
      schemaVersion: 2,
      generatedAt: "2026-06-08T00:00:00.000Z",
      route: {
        slug: "b47",
        routeId: "B47",
        label: "B47",
        corridor: "Fixture",
        corridorFull: "Fixture corridor",
        borough: "Brooklyn",
        sbs: false,
        speedMph: 6,
        scheduledMph: 7,
        weightedAvgSpeed: 6,
        speedPercentile: 10,
        dailyRiders: 1000,
        ridersYoyPct: 0,
        riderHoursLost: 100,
        laneCoverage: 0,
        aceStatus: "none",
        aceSince: null,
        tspCoverage: "none",
        reliability: "Fixture",
        observedReliability: null,
        diagnosis: "Fixture route",
        spark: [6],
        termini: { north: "A", south: "B" },
        miles: 1,
        stops: 2,
        flags: [],
        peerSlug: null,
        interventions: [],
      },
      segments: [],
      artifactRefs: [],
      quality: {
        releaseLayer: "baseline_release",
        completenessStatus: "complete",
        confidence: "medium",
        caveats: [],
      },
    });

    expect(detail.insights).toEqual([]);
  });
});

describe("S4.1 serving readiness gating", () => {
  test("the studio-insight allowlist is a subset of the domain detector-id registry", async () => {
    const { KNOWN_DETECTOR_IDS } = await import("../src/findings");
    const known = new Set<string>(KNOWN_DETECTOR_IDS);
    for (const detectorId of STUDIO_ROUTE_INSIGHT_DETECTOR_IDS) {
      expect(known.has(detectorId), `${detectorId} is not a known detector id`).toBe(true);
    }
  });

  test("a non-allowlisted detector id in a public bucket is structurally excluded", () => {
    const violationManifest = {
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      routes: [
        {
          routeId: "M20",
          publicFindingCandidateRefs: [
            // A real, allowlisted detector — should surface.
            servingRef("speed_pace_hotspot"),
            // An uncalibrated / unknown detector id that has leaked into a public bucket — must NOT
            // reach a public surface even though the bucket is valid.
            {
              detectorId: "fabricated_uncalibrated_detector",
              routeId: "M20",
              scopeId: "M20:2026-03:fabricated",
              month: "2026-03",
              asOfMonth: "2026-03",
              bucket: "public_finding_candidate" as const,
              evidenceRefPath: "fake.json#scope",
              sourceProjectionPath: "fake.json",
              readinessReason: "primary_finding",
              caveats: [],
            },
          ],
          routeContextRefs: [],
        },
      ],
    } satisfies DetectorReadinessServingManifestForInsights;

    const insights = buildRouteInsightsFromDetectorReadiness({
      manifest: violationManifest,
      routeId: "M20",
    });
    const surfacedDetectorIds = new Set(insights.map((insight) => insight.detectorId));

    // Red against the violation: the fabricated id never reaches a public insight...
    expect(surfacedDetectorIds.has("fabricated_uncalibrated_detector")).toBe(false);
    // ...while the allowlisted detector still surfaces (green on the valid ref).
    expect(surfacedDetectorIds.has("speed_pace_hotspot")).toBe(true);
    // Every surfaced detector id is on the allowlist.
    const allowed = new Set<string>(STUDIO_ROUTE_INSIGHT_DETECTOR_IDS);
    for (const detectorId of surfacedDetectorIds) {
      expect(allowed.has(detectorId), `${detectorId} leaked past the allowlist`).toBe(true);
    }
  });

  test("never-public detectors are blocked even from valid public buckets", () => {
    const blockedManifest = {
      artifactKind: "detector_readiness_serving_manifest",
      schemaVersion: 1,
      routes: [
        {
          routeId: "M20",
          publicFindingCandidateRefs: [
            servingRef("speed_pace_hotspot"),
            ...SERVING_BLOCKED_DETECTOR_IDS.map((detectorId) => servingRef(detectorId)),
          ],
          routeContextRefs: SERVING_BLOCKED_DETECTOR_IDS.map((detectorId) => ({
            ...servingRef(detectorId),
            bucket: "route_context" as const,
          })),
        },
      ],
    } satisfies DetectorReadinessServingManifestForInsights;

    const insights = buildRouteInsightsFromDetectorReadiness({
      manifest: blockedManifest,
      routeId: "M20",
    });
    const surfacedDetectorIds = new Set(insights.map((insight) => insight.detectorId));

    expect(surfacedDetectorIds.has("speed_pace_hotspot")).toBe(true);
    for (const detectorId of SERVING_BLOCKED_DETECTOR_IDS) {
      expect(surfacedDetectorIds.has(detectorId), `${detectorId} must never serve`).toBe(false);
    }
  });

  test("the blocklist mirrors the consolidated calibration register dispositions", async () => {
    const registerUrl = new URL(
      "../../../data/artifacts/detector-calibration-register.json",
      import.meta.url,
    );
    const register = (await Bun.file(registerUrl).json()) as {
      entries: readonly { detectorId: string; disposition: string }[];
    };
    const neverPublic = register.entries
      .filter((entry) =>
        ["superseded", "internal_only", "inventory_blocked"].includes(entry.disposition),
      )
      .map((entry) => entry.detectorId)
      .sort();
    expect([...SERVING_BLOCKED_DETECTOR_IDS].sort()).toEqual(neverPublic);
  });
});
