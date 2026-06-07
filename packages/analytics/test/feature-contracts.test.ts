import { describe, expect, test } from "bun:test";
import { SOURCE_GAP_DETECTOR_ID } from "@bp/analytics/detectors";
import {
  FEED_HEALTH_FEATURE_GRAIN,
  type FeatureQuality,
  type FeedHealthFeature,
  feedHealthFeatureKey,
  getFeatureContract,
  hasFeatureQuality,
  INTERVENTION_PANEL_FEATURE_GRAIN,
  type InterventionPanelFeature,
  interventionPanelFeatureKey,
  POSITIVE_DEVIANCE_FEATURE_GRAIN,
  type PositiveDevianceFeature,
  positiveDevianceFeatureKey,
  RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN,
  type RiderWeightedExcessWaitFeature,
  ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN,
  ROUTE_METRIC_HISTORY_FEATURE_GRAIN,
  type RouteDirectionDaypartFeature,
  type RouteMetricHistoryFeature,
  riderWeightedExcessWaitFeatureKey,
  routeDirectionDaypartFeatureKey,
  routeMetricHistoryFeatureKey,
  SEGMENT_DAYPART_FEATURE_GRAIN,
  type SegmentDaypartFeature,
  STOP_DIRECTION_HOUR_FEATURE_GRAIN,
  type StopDirectionHourFeature,
  segmentDaypartFeatureKey,
  stopDirectionHourFeatureKey,
  ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN,
  ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN,
  ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN,
} from "@bp/analytics/features";
import { getAnalyticsDetector } from "@bp/analytics/registry";

const QUALITY: FeatureQuality = {
  coverageStatus: "complete",
  observedCount: 24,
  expectedCount: 24,
  coverageShare: 1,
  freshnessStatus: "fresh",
  sampleCount: 24,
  minSampleCount: 10,
  sampleStatus: "supported",
};

describe("R1 reliability feature contracts", () => {
  test("defines stable grain ids for the literature-driven feature contracts", () => {
    expect(STOP_DIRECTION_HOUR_FEATURE_GRAIN).toBe("stop_direction_hour");
    expect(SEGMENT_DAYPART_FEATURE_GRAIN).toBe("segment_daypart");
    expect(ROUTE_DIRECTION_DAYPART_FEATURE_GRAIN).toBe("route_direction_daypart");
    expect(ROUTE_METRIC_HISTORY_FEATURE_GRAIN).toBe("route_metric_history");
    expect(INTERVENTION_PANEL_FEATURE_GRAIN).toBe("intervention_panel");
    expect(FEED_HEALTH_FEATURE_GRAIN).toBe("feed_health");
    expect(POSITIVE_DEVIANCE_FEATURE_GRAIN).toBe("positive_deviance");
    expect(RIDER_WEIGHTED_EXCESS_WAIT_FEATURE_GRAIN).toBe("rider_weighted_excess_wait");
    expect(ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN).toBe("route_treatment_summary");
    expect(ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN).toBe(
      "route_segment_treatment_summary",
    );
    expect(ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN).toBe("route_treatment_source_gap");
  });

  test("builds deterministic feature keys for each new grain", () => {
    const stopHour: StopDirectionHourFeature = {
      routeId: "M15",
      stopId: "401234",
      stopName: "1 Av/E 42 St",
      direction: "N",
      serviceDate: "2026-03-05",
      localHour: 8,
      timezone: "America/New_York",
      scheduledHeadwayMinutes: 6,
      scheduledBusesPerHour: 10,
      observedHeadwaysMinutes: [5, 8, 4],
      observedPairCount: 3,
      bunchingPairCount: 0,
      gapPairCount: 0,
      quality: QUALITY,
    };
    const segmentDaypart: SegmentDaypartFeature = {
      routeId: "M15",
      month: "2026-03",
      segmentId: "M15:N:10",
      direction: "N",
      daypart: "am_peak",
      traversalCount: 42,
      segmentLengthFeet: 900,
      minSegmentLengthFeet: 300,
      medianSpeedMph: 5.5,
      medianPaceMinutesPerMile: 10.91,
      freeFlowPaceMinutesPerMile: 7.5,
      systematicDelayMinutesPerMile: 3.41,
      stochasticDelayMinutesPerMile: 1.2,
      spatialConfidence: 0.9,
      quality: QUALITY,
    };
    const routeDaypart: RouteDirectionDaypartFeature = {
      routeId: "M15",
      month: "2026-03",
      direction: "N",
      daypart: "am_peak",
      servicePatternVersion: "2026-03-gtfs",
      scheduledRuntimeMinutes: 48,
      observedRuntimeP50Minutes: 55,
      observedRuntimeP95Minutes: 82,
      observedTripCount: 40,
      quality: QUALITY,
    };
    const history: RouteMetricHistoryFeature = {
      scopeKind: "route",
      scopeId: "M15",
      metricName: "excess_wait_minutes",
      historyWindowMonths: 12,
      points: [{ month: "2026-03", value: 2.4, coverageStatus: "complete", routeVersion: null }],
      routeVersionBreaks: [],
      quality: QUALITY,
    };
    const panel: InterventionPanelFeature = {
      eventId: "ace-m15-2026",
      interventionType: "ace",
      treatedScopeKind: "route",
      treatedScopeId: "M15",
      interventionDate: "2026-03-01",
      preWindowStart: "2025-12",
      preWindowEnd: "2026-02",
      postWindowStart: "2026-03",
      postWindowEnd: "2026-05",
      controlScopeIds: ["M14", "M101"],
      controlEligibilityStatus: "eligible",
      preTrendStatus: "not_tested",
      placeboStatus: "not_tested",
      quality: QUALITY,
    };
    const feedHealth: FeedHealthFeature = {
      sourceId: "mta_gtfs_rt_vehicle_positions",
      scopeKind: "route",
      scopeId: "M15",
      month: "2026-03",
      observedRecordCount: 950,
      expectedRecordCount: 1000,
      freshnessLagMinutes: 3,
      validatorIssueCounts: { stale_entity: 2 },
      maintenanceWindow: false,
      quality: QUALITY,
    };
    const positiveDeviance: PositiveDevianceFeature = {
      scopeKind: "route",
      scopeId: "M15",
      routeId: "M15",
      metricName: "average_speed_mph",
      peerGroupId: "manhattan_local",
      peerGroupLabel: "Manhattan local routes",
      peerCount: 12,
      minPeerCount: 8,
      covariates: { borough: "Manhattan" },
      periods: [
        {
          period: "2026-03",
          value: 9.4,
          performancePercentile: 0.95,
          adjustedResidual: 1.2,
          reciprocalMetricWarnings: [],
          coverageStatus: "complete",
        },
      ],
      quality: QUALITY,
    };
    const riderWeightedEwt: RiderWeightedExcessWaitFeature = {
      routeId: "M15",
      stopId: "401234",
      stopName: "1 Av/E 42 St",
      direction: "N",
      serviceDate: "2026-03-05",
      localHour: 8,
      timezone: "America/New_York",
      excessWaitTimeMinutes: 2.8,
      boardings: 75,
      boardingsSource: "apc",
      ridershipSnapshotId: "apc-2026-03",
      ewtDetectorVersion: "1.0.0",
      quality: QUALITY,
      ridershipQuality: QUALITY,
    };
    expect(stopDirectionHourFeatureKey(stopHour)).toBe("M15:N:401234:2026-03-05:08");
    expect(segmentDaypartFeatureKey(segmentDaypart)).toBe("M15:2026-03:N:M15:N:10:am_peak");
    expect(routeDirectionDaypartFeatureKey(routeDaypart)).toBe("M15:2026-03:N:am_peak");
    expect(routeMetricHistoryFeatureKey(history)).toBe("route:M15:excess_wait_minutes:12");
    expect(interventionPanelFeatureKey(panel)).toBe("ace-m15-2026:route:M15");
    expect(feedHealthFeatureKey(feedHealth)).toBe(
      "mta_gtfs_rt_vehicle_positions:route:M15:2026-03",
    );
    expect(positiveDevianceFeatureKey(positiveDeviance)).toBe(
      "route:M15:average_speed_mph:manhattan_local:1",
    );
    expect(riderWeightedExcessWaitFeatureKey(riderWeightedEwt)).toBe("M15:N:401234:2026-03-05:08");
  });

  test("requires quality fields on new feature rows", () => {
    const rows: Array<{ quality: FeatureQuality }> = [
      { quality: QUALITY },
      {
        quality: {
          ...QUALITY,
          coverageStatus: "low_coverage",
          sampleStatus: "insufficient_samples",
        },
      },
    ];

    for (const row of rows) {
      expect(hasFeatureQuality(row)).toBe(true);
      expect(row.quality.coverageStatus).toBeDefined();
      expect(row.quality.freshnessStatus).toBeDefined();
      expect(row.quality.sampleStatus).toBeDefined();
    }
  });

  test("declares feed health as part of the source-gap coverage authority", () => {
    const sourceGap = getAnalyticsDetector(SOURCE_GAP_DETECTOR_ID);

    expect(sourceGap?.featureGrains).toContain(FEED_HEALTH_FEATURE_GRAIN);
    expect(sourceGap?.featureGrains).toContain(ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN);
    expect(sourceGap?.missingDataStates).toEqual(
      expect.arrayContaining([
        "low_coverage",
        "feed_stale",
        "validator_errors",
        "tsp_current_inventory_missing",
        "treatment_source_gap",
      ]),
    );
  });

  test("declares treatment-state feature contracts for detector consumers", () => {
    expect(getFeatureContract(ROUTE_TREATMENT_SUMMARY_FEATURE_GRAIN)).toMatchObject({
      resolverId: "artifact.route_treatment_summary.route.v1",
      grainKeys: ["routeId", "month", "treatmentType", "geographyScope"],
      routeMonthUsage: "screening_only",
    });
    expect(getFeatureContract(ROUTE_SEGMENT_TREATMENT_SUMMARY_FEATURE_GRAIN)).toMatchObject({
      resolverId: "artifact.route_treatment_summary.segment.v1",
      grainKeys: ["routeId", "month", "segmentId", "directionId", "treatmentType"],
      routeMonthUsage: "not_route_month",
    });
    expect(getFeatureContract(ROUTE_TREATMENT_SOURCE_GAP_FEATURE_GRAIN)).toMatchObject({
      resolverId: "artifact.route_treatment_summary.source_gap.v1",
      grainKeys: ["routeId", "month", "treatmentType", "gapKind"],
      routeMonthUsage: "screening_only",
    });
  });
});
