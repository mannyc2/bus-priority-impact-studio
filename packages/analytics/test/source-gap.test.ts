import { describe, expect, test } from "bun:test";
import { detectSourceGaps, type SourceGapRouteInput } from "../src/index.js";

const GENERATED_AT = "2026-05-19T12:00:00.000Z";
const MONTH = "2026-03";
const RUN_ID = "abcdef0123456789abcdef0123456789";

function baseRoute(over: Partial<SourceGapRouteInput> = {}): SourceGapRouteInput {
  return {
    routeId: "M15",
    hasSpeedData: true,
    speedObservationCount: 1000,
    hasGeometry: true,
    observedHeadwaySampleCount: 500,
    scheduledBaselineHeadwaySampleCount: 500,
    ...over,
  };
}

describe("detectSourceGaps", () => {
  test("emits clean_no_hit coverage when every input is present", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
    });

    expect(out.candidates).toHaveLength(0);
    expect(out.evidence).toHaveLength(0);
    expect(out.coverage).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("clean_no_hit");
    expect(out.coverage[0]?.scopeKind as string).toBe("route");
    expect(out.coverage[0]?.scopeId).toBe("M15");
  });

  test("emits a missing_speed candidate when speed data is absent", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ hasSpeedData: false, speedObservationCount: 0 })],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.reasonCode as string).toBe("missing_speed");
    expect(out.candidates[0]?.severity as string).toBe("high");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("insufficient_evidence");
    expect(out.evidence).toHaveLength(1);
    expect(out.evidence[0]?.evidenceKind as string).toBe("missing_data");
    expect(out.evidence[0]?.evidenceRole as string).toBe("missing_data");
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });

  test("emits missing_geometry when no LION links exist for the route", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ hasGeometry: false })],
    });

    const reasons = out.candidates.map((c) => c.reasonCode as string);
    expect(reasons).toContain("missing_geometry");
  });

  test("flags insufficient_gtfs_rt_samples below threshold", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ observedHeadwaySampleCount: 50 })],
      thresholds: { minGtfsRtHeadwaySamples: 100 },
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.reasonCode as string).toBe("insufficient_gtfs_rt_samples");
    expect(out.candidates[0]?.severity as string).toBe("medium");
  });

  test("flags missing_scheduled_baseline when no scheduled headway samples exist", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ scheduledBaselineHeadwaySampleCount: 0 })],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.reasonCode as string).toBe("missing_scheduled_baseline");
    expect(out.candidates[0]?.severity as string).toBe("medium");
  });

  test("flags failed_context_join as a system-scoped source gap", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
      contextJoins: [
        {
          sourceId: "nyc_parking_violations_current",
          eventKinds: ["parking_violation"],
          joinableEventCount: 1000,
          joinedEventCount: 30,
        },
        {
          sourceId: "nypd_motor_vehicle_collisions",
          eventKinds: ["collision"],
          joinableEventCount: 1000,
          joinedEventCount: 748,
        },
        {
          sourceId: "tiny_probe",
          eventKinds: ["probe"],
          joinableEventCount: 2,
          joinedEventCount: 0,
        },
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.scopeKind as string).toBe("system");
    expect(out.candidates[0]?.routeId).toBeNull();
    expect(out.candidates[0]?.reasonCode as string).toBe("failed_context_join");
    expect(out.evidence[0]?.evidenceKind as string).toBe("coverage_audit");
    expect(out.coverage.map((row) => row.scopeKind as string)).toEqual([
      "route",
      "system",
      "system",
      "system",
    ]);
    expect(
      out.coverage.find((row) => row.scopeId === "context_join:tiny_probe")?.outcome as string,
    ).toBe("skipped_missing_input");
    expect(
      out.coverage.find((row) => row.scopeId === "context_join:nypd_motor_vehicle_collisions")
        ?.outcome as string,
    ).toBe("clean_no_hit");
    expect(
      out.coverage.find((row) => row.scopeId === "context_join:nyc_parking_violations_current")
        ?.outcome as string,
    ).toBe("hit");
  });

  test("flags bus_lane_date_gap for sentinel implementation dates", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ routeId: "M15" }), baseRoute({ routeId: "M1" })],
      busLaneDates: [
        {
          routeId: "M15",
          sentinelDate: "2026-03-01T00:00:00.000Z",
          interventionCount: 2,
        },
      ],
    });

    expect(out.candidates.map((candidate) => candidate.reasonCode as string)).toEqual([
      "bus_lane_date_gap",
    ]);
    expect(out.candidates[0]?.routeId as string).toBe("M15");
  });

  test("flags source_lag using per-source freshness policy inputs", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: "2026-05-20T00:00:00.000Z",
      routes: [baseRoute()],
      sourceFreshness: [
        {
          sourceId: "nyc_311_service_requests_current",
          latestIngestedAt: "2026-05-19T00:00:00.000Z",
          expectedLagDays: 2,
        },
        {
          sourceId: "nypd_motor_vehicle_collisions",
          latestIngestedAt: "2026-05-01T00:00:00.000Z",
          expectedLagDays: 7,
        },
      ],
    });

    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]?.reasonCode as string).toBe("source_lag");
    expect(out.candidates[0]?.claimSafeLabel as string).toBe("source_lag_expected");
    expect(
      out.coverage.find((row) => row.scopeId === "source_lag:nyc_311_service_requests_current")
        ?.outcome as string,
    ).toBe("clean_no_hit");
    expect(
      out.coverage.find((row) => row.scopeId === "source_lag:nypd_motor_vehicle_collisions")
        ?.outcome as string,
    ).toBe("source_lag");
  });

  test("emits TSP current-inventory candidates from source-gap model rows", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute()],
      treatmentSourceGaps: [
        {
          routeId: "M15",
          treatmentType: "transit_signal_priority",
          gapKind: "current_inventory_missing",
          sourceGapCount: 1,
          blocksClaims: ["coverage", "current_confirmed_route"],
          sourceRefs: ["source_gap:tsp_current_route_intersection_inventory"],
          publicStatements: ["Current route/intersection inventory missing from public sources."],
        },
      ],
    });

    const modelCandidate = out.candidates.find(
      (candidate) => candidate.reasonCode === "tsp_current_inventory_missing",
    );
    expect(modelCandidate).toMatchObject({
      routeId: "M15",
      scopeKind: "route",
      scopeId: "M15",
      claimSafeLabel: "insufficient_evidence",
    });
    expect(
      out.evidence.find((link) => link.candidateId === modelCandidate?.candidateId),
    ).toMatchObject({
      evidenceKind: "missing_data",
      evidenceRole: "missing_data",
    });
    expect(
      out.coverage.find((row) => row.reasonCode === "tsp_current_inventory_missing"),
    ).toMatchObject({
      outcome: "hit",
      reason: "Treatment source-gap model row is present.",
    });
  });

  test("emits stable candidate IDs across runs with same run id", () => {
    const args = {
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [baseRoute({ hasSpeedData: false, speedObservationCount: 0 })],
    };
    const a = detectSourceGaps(args);
    const b = detectSourceGaps(args);
    expect(a.candidates[0]?.candidateId).toBe(b.candidates[0]?.candidateId);
    expect(a.coverage[0]?.auditId).toBe(b.coverage[0]?.auditId);
  });

  test("multi-gap route emits one candidate per reason and a single hit audit", () => {
    const out = detectSourceGaps({
      detectorRunId: RUN_ID,
      month: MONTH,
      generatedAt: GENERATED_AT,
      routes: [
        baseRoute({
          hasSpeedData: false,
          speedObservationCount: 0,
          hasGeometry: false,
          observedHeadwaySampleCount: 0,
          scheduledBaselineHeadwaySampleCount: 0,
        }),
      ],
    });

    expect(out.candidates).toHaveLength(4);
    expect(out.coverage).toHaveLength(1);
    expect(out.coverage[0]?.outcome as string).toBe("hit");
  });
});
