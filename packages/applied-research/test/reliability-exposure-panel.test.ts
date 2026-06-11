import { describe, expect, test } from "bun:test";
import {
  buildReliabilityExposurePanelArtifactV1,
  buildRiderWeightedExcessWaitFeaturesFromReliabilityExposurePanelRows,
} from "../src/feature-resolvers";
import type { StopDirectionHourFeature } from "@bp/analytics/features";

const quality = {
  coverageStatus: "complete",
  observedCount: 1,
  expectedCount: 1,
  coverageShare: 1,
  freshnessStatus: "not_expected",
  sampleCount: 3,
  minSampleCount: 1,
  sampleStatus: "supported",
} as const;

function stopFeature(over: Partial<StopDirectionHourFeature> = {}): StopDirectionHourFeature {
  return {
    routeId: "M1",
    stopId: "s1",
    stopName: "Stop 1",
    direction: "N",
    serviceDate: "2026-03:Weekday",
    localHour: 8,
    timezone: "America/New_York",
    scheduledHeadwayMinutes: 10,
    scheduledBusesPerHour: 6,
    observedHeadwaysMinutes: [10, 20, 30],
    observedPairCount: 3,
    bunchingPairCount: 0,
    gapPairCount: 1,
    quality,
    ...over,
  };
}

describe("reliability exposure panel", () => {
  test("builds rider-exposure rows from stop-hour EWT and route-hour ridership proxy", () => {
    const artifact = buildReliabilityExposurePanelArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "reliability-exposure-panel.json",
      spec: {
        panelId: "reliability_exposure_panel_v1",
        releaseMonth: "2026-03",
        runId: "bus-observatory-2026-03",
      },
      stopFeatures: [
        stopFeature({ stopId: "s1", stopName: "Stop 1" }),
        stopFeature({ stopId: "s2", stopName: "Stop 2" }),
        stopFeature({
          routeId: "M2",
          stopId: "s3",
          stopName: "Stop 3",
          observedHeadwaysMinutes: [],
        }),
      ],
      ridershipRows: [
        {
          route_id: "M1",
          month: "2026-03",
          day_of_week: "Weekday",
          hour_of_day: 8,
          ridership: 100,
        },
      ],
    });

    expect(artifact.summary).toMatchObject({
      stopFeatureCount: 3,
      ridershipRowCount: 1,
      panelRowCount: 3,
      supportedRowCount: 2,
      rowWithRidershipCount: 2,
      rowWithExcessWaitCount: 2,
      rowWithRiderDelayCount: 2,
      routeCount: 2,
    });
    expect(artifact.panelManifest.spec).toMatchObject({
      panelId: "reliability_exposure_panel_v1",
      grain: "route_id + direction + stop_id + service_date + local_hour",
      requiredProducts: [
        expect.objectContaining({ productId: "stop_direction_hour_ewt_features" }),
        expect.objectContaining({ productId: "local_route_hourly_ridership_history" }),
      ],
    });

    const m1Rows = artifact.rows.filter((row) => row.routeId === "M1");
    expect(m1Rows.map((row) => row.boardings)).toEqual([50, 50]);
    expect(m1Rows.every((row) => row.riderDelayMinutes !== null)).toBe(true);

    const missingRidership = artifact.rows.find((row) => row.routeId === "M2");
    expect(missingRidership).toMatchObject({
      boardings: null,
      riderExposureSupported: false,
      reliabilitySupported: false,
      ridershipCoverageStatus: "missing",
    });

    const resolved = buildRiderWeightedExcessWaitFeaturesFromReliabilityExposurePanelRows({
      rows: artifact.rows,
    });
    expect(resolved.summary).toMatchObject({
      sourceKind: "rider_weighted_excess_wait_from_reliability_exposure_panel_v1",
      panelRowCount: 3,
      featureCount: 3,
      featureWithRidershipCount: 2,
      featureWithExcessWaitCount: 2,
      featureWithRiderDelayCount: 2,
    });
    expect(resolved.features[0]).toMatchObject({
      routeId: "M1",
      stopId: "s1",
      excessWaitTimeMinutes: m1Rows[0]?.excessWaitTimeMinutes,
      boardings: 50,
      boardingsSource: "route_hourly_ridership_stop_hour_proxy",
      quality: expect.objectContaining({ sampleStatus: "supported" }),
      ridershipQuality: expect.objectContaining({ sampleStatus: "supported" }),
    });
    expect(resolved.features.find((feature) => feature.routeId === "M2")).toMatchObject({
      boardings: null,
      excessWaitTimeMinutes: null,
      ridershipQuality: expect.objectContaining({ coverageStatus: "missing" }),
    });
  });
});
