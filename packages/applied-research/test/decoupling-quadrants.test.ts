import { describe, expect, test } from "bun:test";
import { decouplingQuadrantsArtifactPath } from "../src/artifacts";
import {
  buildDecouplingQuadrantsArtifactV1,
  ROUTE_DECOUPLING_PANEL_V1_ID,
} from "../src/feature-resolvers";

function trend(routeId: string, month: string, speed: number, ridership: number) {
  return {
    route_id: routeId,
    month,
    speed_observation_count: 100,
    average_speed_mph: speed,
    ridership,
    has_speed_trend: 1,
    has_ridership_trend: 1,
  };
}

function reliability(routeId: string, month: string, excessWaitMinutes: number) {
  return {
    route_id: routeId,
    month,
    reliability_status: "observed",
    sample_count: 100,
    min_sample_threshold: 30,
    observed_long_gap_share: 0.1,
    excess_wait_minutes: excessWaitMinutes,
    wait_reliability_ratio: 1.2,
  };
}

function reliabilityLongGapOnly(routeId: string, month: string, longGapShare: number) {
  return {
    route_id: routeId,
    month,
    reliability_status: "observed",
    sample_count: 100,
    min_sample_threshold: 30,
    observed_long_gap_share: longGapShare,
    excess_wait_minutes: null,
    wait_reliability_ratio: 1.2,
  };
}

describe("decoupling quadrants", () => {
  test("builds internal-lab route decoupling rows from speed, ridership, and reliability history", () => {
    const artifact = buildDecouplingQuadrantsArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "decoupling-quadrants.json",
      spec: {
        panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
        historyStartMonth: "2026-01",
        releaseMonth: "2026-03",
        minHistoryMonths: 2,
      },
      routeTrendRows: [
        trend("M15", "2026-01", 8, 1000),
        trend("M15", "2026-02", 8.2, 1020),
        trend("M15", "2026-03", 7.2, 1030),
        trend("B41", "2026-01", 7, 1000),
        trend("B41", "2026-02", 7.1, 1000),
        trend("B41", "2026-03", 7.8, 850),
      ],
      reliabilityRows: [
        reliability("M15", "2026-01", 4),
        reliability("M15", "2026-02", 4),
        reliability("M15", "2026-03", 3.5),
        reliability("B41", "2026-01", 5),
        reliability("B41", "2026-02", 5),
        reliability("B41", "2026-03", 5.2),
      ],
    });

    expect(artifact.summary).toMatchObject({
      panelRowCount: 2,
      routeCount: 2,
      supportedSpeedRidershipRowCount: 2,
      supportedReliabilityRowCount: 2,
      publicClaimAllowedCount: 0,
    });
    expect(artifact.summary.patternCounts["speed_worse_ridership_resilient"]).toBe(1);
    expect(artifact.summary.patternCounts["speed_better_ridership_down"]).toBe(1);
    expect(artifact.rows).toContainEqual(
      expect.objectContaining({
        routeId: "M15",
        pattern: "speed_worse_ridership_resilient",
        reviewDisposition: "internal_lab",
        publicClaimAllowed: false,
      }),
    );
    expect(artifact.panelManifest.spec).toMatchObject({
      panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
      requiredProducts: [
        expect.objectContaining({ productId: "local_route_month_trends_history" }),
        expect.objectContaining({ productId: "local_route_observed_reliability_summary_release" }),
      ],
    });
  });

  test("uses long-gap-share deltas when historical excess-wait is not populated", () => {
    const artifact = buildDecouplingQuadrantsArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "decoupling-quadrants.json",
      spec: {
        panelId: ROUTE_DECOUPLING_PANEL_V1_ID,
        historyStartMonth: "2026-01",
        releaseMonth: "2026-03",
        minHistoryMonths: 2,
      },
      routeTrendRows: [
        trend("B39", "2026-01", 8, 1000),
        trend("B39", "2026-02", 8.1, 1000),
        trend("B39", "2026-03", 8.0, 1000),
      ],
      reliabilityRows: [
        reliabilityLongGapOnly("B39", "2026-01", 0.1),
        reliabilityLongGapOnly("B39", "2026-02", 0.12),
        reliabilityLongGapOnly("B39", "2026-03", 0.2),
      ],
    });

    expect(artifact.summary.supportedReliabilityRowCount).toBe(1);
    expect(artifact.rows[0]).toMatchObject({
      routeId: "B39",
      excessWaitDeltaMinutes: null,
      longGapShareDelta: 0.09,
      pattern: "reliability_worse_speed_stable_or_better",
    });
    expect(artifact.rows[0]?.evidence.primary).toContain("long_gap_share_delta=0.09");
    expect(artifact.rows[0]?.evidence.caveats).toContain(
      "Historical excess-wait is missing, so long-gap-share delta is used for reliability trend.",
    );
  });

  test("owns the decoupling quadrants artifact path", () => {
    expect(
      decouplingQuadrantsArtifactPath({
        artifactRoot: "data/artifacts",
        historyStartMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/decoupling-quadrants-v1/2023-04_to_2026-03/2026-03/decoupling-quadrants.json",
    );
  });
});
