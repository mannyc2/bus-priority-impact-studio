import { describe, expect, test } from "bun:test";
import type { FeatureQuality, StopDirectionHourFeature } from "@bp/analytics/features";
import { buildTreatmentDetectorReviewArtifact } from "../src/detector-runs";
import {
  buildDelayConcentrationRoutes,
  buildInterventionGapRoutesFromTreatmentFeatures,
  buildInterventionPanelFeatures,
  buildInterventionUnderperformanceRoutesFromTreatmentFeatures,
  buildPositiveDevianceFeatures,
  buildRiderWeightedExcessWaitFeatures,
  buildTreatmentScopeGapSegmentsFromTreatmentFeatures,
  buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures,
  type RoutePainSourceRow,
} from "../src/feature-resolvers";
import { buildTreatmentFeaturesFromSummaryArtifact } from "../src/feature-resolvers";
import {
  buildRouteTreatmentSummaryArtifact,
  segmentTreatmentRowsFromLaneOverlaps,
} from "../src/treatments";

function quality(over: Partial<FeatureQuality> = {}): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 30,
    expectedCount: 30,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: 30,
    minSampleCount: 10,
    sampleStatus: "supported",
    ...over,
  };
}

function stopHour(over: Partial<StopDirectionHourFeature> = {}): StopDirectionHourFeature {
  return {
    routeId: "M15",
    stopId: "401234",
    stopName: "1 Av/E 42 St",
    direction: "N",
    serviceDate: "2026-03-05",
    localHour: 8,
    timezone: "America/New_York",
    scheduledHeadwayMinutes: 10,
    scheduledBusesPerHour: 6,
    observedHeadwaysMinutes: [3, 3, 3, 3, 3, 15, 15, 18, 18, 24],
    observedPairCount: 10,
    bunchingPairCount: 0,
    gapPairCount: 1,
    quality: quality(),
    ...over,
  };
}

function routePainRow(over: Partial<RoutePainSourceRow> = {}): RoutePainSourceRow {
  return {
    route_id: "M57",
    month: "2026-03",
    route_score: 2,
    public_visible: 1,
    public_visibility_reason: "public",
    average_speed_mph: 5.1,
    hotspot_count: 10,
    reliability_status: "observed",
    min_sample_threshold: 30,
    sample_count: 200,
    observed_long_gap_share: 0.7,
    excess_wait_minutes: 40,
    wait_reliability_ratio: 12,
    ...over,
  };
}

describe("detector-family feature resolvers", () => {
  test("builds rider-weighted EWT features from stop-hour EWT and route-hour ridership", () => {
    const result = buildRiderWeightedExcessWaitFeatures({
      stopFeatures: [
        stopHour({ stopId: "s1" }),
        stopHour({ stopId: "s2" }),
        stopHour({ stopId: "s3", localHour: 9 }),
      ],
      ridershipRows: [
        {
          route_id: "M15",
          month: "2026-03",
          day_of_week: "Weekday",
          hour_of_day: 8,
          ridership: 120,
        },
      ],
    });

    expect(result.features).toHaveLength(3);
    expect(result.features[0]?.boardings).toBe(60);
    expect(result.features[1]?.boardings).toBe(60);
    expect(result.features[2]?.boardings).toBeNull();
    expect(result.summary["featureWithRidershipCount"]).toBe(2);
    expect(result.summary["featureWithExcessWaitCount"]).toBe(3);
  });

  test("builds positive-deviance features from route-month peers", () => {
    const result = buildPositiveDevianceFeatures({
      releaseMonth: "2026-03",
      minPeerCount: 2,
      minStablePeriods: 2,
      rows: [
        { route_id: "M15", month: "2026-02", speed_observation_count: 30, average_speed_mph: 8 },
        { route_id: "M15", month: "2026-03", speed_observation_count: 30, average_speed_mph: 9 },
        { route_id: "M20", month: "2026-02", speed_observation_count: 30, average_speed_mph: 5 },
        { route_id: "M20", month: "2026-03", speed_observation_count: 30, average_speed_mph: 6 },
      ],
    });

    const m15 = result.features.find((feature) => feature.routeId === "M15");
    expect(result.summary["supportedFeatureCount"]).toBe(2);
    expect(m15?.quality.sampleStatus).toBe("supported");
    expect(m15?.periods.at(-1)?.performancePercentile).toBe(1);
  });

  test("builds intervention panel features with explicit control eligibility", () => {
    const result = buildInterventionPanelFeatures({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          event_id: "evt-1",
          intervention_type: "bus_lane",
          implementation_date: "2026-01-15",
          implementation_month: "2026-01",
          comparison_status: "evaluated",
          pre_start_month: "2025-10",
          pre_end_month: "2025-12",
          post_start_month: "2026-02",
          post_end_month: "2026-03",
          comparison_route_count: 3,
          comparison_route_ids: JSON.stringify(["M20", "M21", "M22"]),
          adjusted_speed_delta_mph: 1.2,
          speed_delta_mph: 1,
        },
      ],
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.controlEligibilityStatus).toBe("eligible");
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.features[0]?.matchedPeerDelta).toBe(1.2);
  });

  test("groups delay-concentration segment rows into route inputs", () => {
    const result = buildDelayConcentrationRoutes({
      rows: [
        {
          route_id: "M15",
          segment_id: "M15:0:1:a:b",
          direction: "0",
          stop_order: 1,
          timepoint_stop_name: "A",
          next_timepoint_stop_name: "B",
          observation_count: 10,
          bus_trip_count: 25,
          weighted_average_speed_mph: 5,
          weighted_average_travel_time_minutes: 8,
          average_road_distance_miles: 0.6,
        },
      ],
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.routeId).toBe("M15");
    expect(result.routes[0]?.segments[0]?.segmentId).toBe("M15:0:1:a:b");
    expect(result.summary["segmentCount"]).toBe(1);
  });

  test("projects route-treatment summary artifacts into detector feature rows", () => {
    const artifact = buildRouteTreatmentSummaryArtifact({
      month: "2026-03",
      routeIds: ["B41"],
      evidenceRows: [
        {
          routeId: "B41",
          month: "2026-03",
          treatmentType: "automated_bus_lane_enforcement",
          status: "current_confirmed",
          evidenceLabel: "deterministic_source",
          sourceRefs: ["ace:B41"],
        },
      ],
      segmentTreatmentRows: segmentTreatmentRowsFromLaneOverlaps({
        rows: [
          {
            routeId: "B41",
            month: "2026-03",
            segmentId: "B41:2026-03:N:1:300001:300002",
            directionId: "N",
            segmentOrder: 1,
            laneSource: "dot_bus_lanes_geometry",
            laneOverlapShare: 0.7,
            laneMatchedCount: 1,
            laneTypes: ["Offset"],
            laneOperatingHours: [],
            laneOperatingDays: [],
          },
        ],
      }),
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
    });

    const resolved = buildTreatmentFeaturesFromSummaryArtifact({ artifact });

    expect(resolved.routeTreatmentFeatures).toHaveLength(12);
    expect(resolved.routeSegmentTreatmentFeatures).toContainEqual(
      expect.objectContaining({
        routeId: "B41",
        segmentId: "B41:2026-03:N:1:300001:300002",
        treatmentType: "bus_lane",
        status: "current_confirmed",
        matchMethod: "route_shape_overlap",
      }),
    );
    expect(resolved.routeTreatmentSourceGapFeatures).toContainEqual(
      expect.objectContaining({
        routeId: "B41",
        treatmentType: "transit_signal_priority",
        gapKind: "current_inventory_missing",
      }),
    );
  });

  test("builds intervention-gap route inputs from route pain and treatment source gaps", () => {
    const result = buildInterventionGapRoutesFromTreatmentFeatures({
      routePainRows: [
        routePainRow(),
        routePainRow({ route_id: "B41", route_score: 12, average_speed_mph: 6.3 }),
      ],
      routeTreatmentFeatures: [
        {
          routeId: "B41",
          month: "2026-03",
          treatmentType: "automated_bus_lane_enforcement",
          status: "current_confirmed",
          geographyScope: "route",
          evidenceLabel: "deterministic_source",
          confidence: "high",
          sourceRefs: ["ace:B41"],
        },
      ],
      routeTreatmentSourceGapFeatures: [
        {
          routeId: "M57",
          month: "2026-03",
          treatmentType: "transit_signal_priority",
          gapKind: "current_inventory_missing",
          sourceRefs: ["tsp:source-gap"],
          publicStatement: "Current route-level TSP inventory is not published.",
          blocksClaims: ["tsp_absence"],
        },
      ],
    });

    expect(result.routes).toContainEqual(
      expect.objectContaining({
        routeId: "M57",
        speedPainScore: 98,
        interventionEvidenceStatus: "thin_source_gap",
        interventionEvidenceCount: 1,
      }),
    );
    expect(result.routes).toContainEqual(
      expect.objectContaining({
        routeId: "B41",
        interventionEvidenceStatus: "dated_or_evaluated",
      }),
    );
    expect(result.summary["thinSourceGapRouteCount"]).toBe(1);
    expect(result.summary["datedOrEvaluatedRouteCount"]).toBe(1);
  });

  test("builds underperformance route inputs with treatment evidence counts", () => {
    const result = buildInterventionUnderperformanceRoutesFromTreatmentFeatures({
      routePainRows: [routePainRow()],
      interventionComparisonRows: [
        {
          route_id: "M57",
          month: "2026-03",
          event_id: "bus-lane:M57:2024-09",
          intervention_type: "bus_lane_infrastructure",
          implementation_date: "2024-09-01",
          implementation_month: "2024-09",
          comparison_status: "evaluated",
          pre_start_month: "2024-06",
          pre_end_month: "2024-08",
          post_start_month: "2024-10",
          post_end_month: "2026-03",
          comparison_route_count: 10,
          comparison_route_ids: JSON.stringify(["M42"]),
          adjusted_speed_delta_mph: -0.15,
          speed_delta_mph: -0.1,
        },
      ],
      routeTreatmentFeatures: [
        {
          routeId: "M57",
          month: "2026-03",
          treatmentType: "bus_lane",
          status: "current_confirmed",
          geographyScope: "route",
          evidenceLabel: "deterministic_source",
          confidence: "high",
          sourceRefs: ["bus-lane:M57"],
        },
      ],
      routeSegmentTreatmentFeatures: [
        {
          routeId: "M57",
          month: "2026-03",
          treatmentType: "bus_lane",
          status: "current_confirmed",
          geographyScope: "segment",
          evidenceLabel: "deterministic_source",
          confidence: "medium",
          sourceRefs: ["bus-lane-segment:M57:1"],
          segmentId: "M57:2026-03:N:1:400001:400002",
          directionId: "N",
          segmentOrder: 1,
          matchMethod: "route_shape_overlap",
          overlapShare: 0.5,
          laneTypes: [],
        },
      ],
    });

    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      routeId: "M57",
      speedPainScore: 98,
      routeTreatmentEvidenceCount: 1,
      segmentTreatmentEvidenceCount: 1,
    });
    expect(result.routes[0]?.comparisons[0]).toMatchObject({
      eventId: "bus-lane:M57:2024-09",
      comparisonStatus: "evaluated",
      adjustedSpeedDeltaMph: -0.15,
    });
    expect(result.summary["routeWithEvaluatedComparisonCount"]).toBe(1);
    expect(result.summary["routeWithSegmentTreatmentEvidenceCount"]).toBe(1);
  });

  test("builds treatment scope-mismatch segment inputs with matching speed rows", () => {
    const result = buildTreatmentScopeMismatchSegmentsFromTreatmentFeatures({
      segmentSpeedRows: [
        {
          route_id: "M96",
          month: "2026-03",
          segment_id: "M96:2026-03:W:10:401965:903004",
          direction: "W",
          stop_order: 10,
          average_speed_mph: 4.9,
          segment_length_feet: 500,
          observation_count: 90,
          bus_trip_count: 300,
        },
        {
          route_id: "M96",
          month: "2026-03",
          segment_id: "M96:2026-03:W:11:903004:401970",
          direction: "W",
          stop_order: 11,
          average_speed_mph: 7.1,
          segment_length_feet: 600,
          observation_count: 88,
          bus_trip_count: 280,
        },
        {
          route_id: "B41",
          month: "2026-03",
          segment_id: "B41:2026-03:N:1:300001:300002",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 3.8,
          segment_length_feet: 550,
          observation_count: 70,
          bus_trip_count: 210,
        },
      ],
      segmentDaypartSpeedRows: [
        {
          route_id: "M96",
          month: "2026-03",
          segment_id: "M96:2026-03:W:10:401965:903004",
          direction: "W",
          stop_order: 10,
          daypart: "am_peak",
          average_speed_mph: 4.1,
          observation_count: 12,
          bus_trip_count: 90,
        },
        {
          route_id: "M96",
          month: "2026-03",
          segment_id: "M96:2026-03:W:10:401965:903004",
          direction: "W",
          stop_order: 10,
          daypart: "midday",
          average_speed_mph: 5.4,
          observation_count: 18,
          bus_trip_count: 120,
        },
      ],
      segmentSpeedResidualRows: [
        {
          routeId: "M96",
          month: "2026-03",
          segmentId: "M96:2026-03:W:10:401965:903004",
          stableSegmentKey: "M96:W:10:401965:903004",
          directionId: "W",
          stopOrder: 10,
          directionMaxStopOrder: 11,
          isTerminalSegment: false,
          averageSpeedMph: 4.9,
          expectedSpeedMph: 6.2,
          speedResidualMph: -1.3,
          residualPercentileWithinMonth: 0.05,
          residualRankWithinMonth: 12,
          residualMonthCount: 4000,
          segmentHistoryMeanSpeedMph: 6.1,
          segmentHistoryMedianSpeedMph: 6,
          segmentHistoryMonthCount: 24,
          routeMonthMeanSpeedMph: 7.4,
          routeHistoryMeanSpeedMph: 7.3,
          observationCount: 90,
          busTripCount: 300,
        },
      ],
      routeSegmentTreatmentFeatures: [
        {
          routeId: "M96",
          month: "2026-03",
          treatmentType: "bus_lane",
          status: "current_confirmed",
          geographyScope: "segment",
          evidenceLabel: "deterministic_source",
          confidence: "high",
          sourceRefs: ["bus-lane-segment:M96"],
          segmentId: "M96:2026-03:W:10:401965:903004",
          directionId: "W",
          segmentOrder: 10,
          matchMethod: "route_shape_overlap",
          overlapShare: 0.7,
          laneTypes: [],
        },
      ],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      routeId: "M96",
      segmentId: "M96:2026-03:W:10:401965:903004",
      averageSpeedMph: 4.9,
      segmentLengthFeet: 500,
      observationCount: 90,
      treatmentStatus: "current_confirmed",
      slowestDaypart: "am_peak",
      routeSegmentSpeedRank: 1,
      routeSegmentCount: 2,
      networkSegmentSpeedRank: 2,
      networkSegmentCount: 3,
      speedResidualContext: {
        expectedSpeedMph: 6.2,
        speedResidualMph: -1.3,
        residualPercentileWithinMonth: 0.05,
        modelId: "segment_speed_residuals_v1",
      },
    });
    expect(result.summary["segmentWithSpeedCount"]).toBe(1);
    expect(result.summary["segmentWithDaypartContextCount"]).toBe(1);
    expect(result.summary["segmentWithSpeedResidualContextCount"]).toBe(1);
    expect(result.summary["segmentWithRoutePeerRankCount"]).toBe(1);
  });

  test("attaches intervention scope-fit context to treatment scope-gap segment inputs", () => {
    const result = buildTreatmentScopeGapSegmentsFromTreatmentFeatures({
      segmentSpeedRows: [
        {
          route_id: "B41",
          month: "2026-03",
          segment_id: "B41:2026-03:N:12:301001:301002",
          direction: "N",
          stop_order: 12,
          average_speed_mph: 4.8,
          segment_length_feet: 900,
          observation_count: 120,
          bus_trip_count: 450,
        },
      ],
      routeTreatmentFeatures: [
        {
          routeId: "B41",
          month: "2026-03",
          treatmentType: "bus_lane",
          status: "current_confirmed",
          geographyScope: "route",
          evidenceLabel: "deterministic_source",
          confidence: "high",
          sourceRefs: ["route:bus-lane:B41"],
        },
      ],
      routeSegmentTreatmentFeatures: [
        {
          routeId: "B41",
          month: "2026-03",
          treatmentType: "bus_lane",
          status: "not_found",
          geographyScope: "segment",
          evidenceLabel: "deterministic_source",
          confidence: "medium",
          sourceRefs: [],
          segmentId: "B41:2026-03:N:12:301001:301002",
          directionId: "N",
          segmentOrder: 12,
          matchMethod: "not_matched",
          overlapShare: 0,
          laneTypes: [],
        },
      ],
      interventionScopeFitRows: [
        {
          routeId: "B41",
          month: "2026-03",
          treatmentType: "bus_lane",
          segmentId: "B41:2026-03:N:12:301001:301002",
          directionId: "N",
          segmentOrder: 12,
          fitStatus: "true_uncovered",
          matchMethod: "not_matched",
          overlapShare: 0,
          routePositiveTreatmentCount: 1,
          segmentPositiveTreatmentCount: 0,
          sourceGapCount: 0,
          sourceGapKinds: [],
          blocksClaims: [],
          sourceRefs: ["scope-fit:B41"],
        },
      ],
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      segmentId: "B41:2026-03:N:12:301001:301002",
      treatmentScopeFitContext: {
        fitStatus: "true_uncovered",
        sourceGapCount: 0,
        sourceGapKinds: [],
        blocksClaims: [],
      },
    });
    expect(result.summary["interventionScopeFitRowCount"]).toBe(1);
    expect(result.summary["segmentWithScopeFitContextCount"]).toBe(1);
  });

  test("builds treatment-informed detector review seeds without promoting claims", () => {
    const resolved = buildTreatmentFeaturesFromSummaryArtifact({
      artifact: buildRouteTreatmentSummaryArtifact({
        month: "2026-03",
        routeIds: ["B41"],
        evidenceRows: [
          {
            routeId: "B41",
            month: "2026-03",
            treatmentType: "bus_lane",
            status: "current_confirmed",
            evidenceLabel: "deterministic_source",
            sourceRefs: ["route:bus-lane:B41"],
          },
        ],
        segmentTreatmentRows: segmentTreatmentRowsFromLaneOverlaps({
          rows: [
            {
              routeId: "B41",
              month: "2026-03",
              segmentId: "B41:2026-03:N:1:300001:300002",
              directionId: "N",
              segmentOrder: 1,
              laneSource: "dot_bus_lanes_geometry",
              laneOverlapShare: 0.7,
              laneMatchedCount: 1,
              laneTypes: ["Offset"],
              laneOperatingHours: [],
              laneOperatingDays: [],
            },
          ],
        }),
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath:
          "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
      }),
    });

    const artifact = buildTreatmentDetectorReviewArtifact({
      month: "2026-03",
      generatedAt: "2026-06-06T00:00:00.000Z",
      artifactPath:
        "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
      routeTreatmentFeatures: resolved.routeTreatmentFeatures,
      routeSegmentTreatmentFeatures: resolved.routeSegmentTreatmentFeatures,
      routeTreatmentSourceGapFeatures: resolved.routeTreatmentSourceGapFeatures,
      speedRows: [
        {
          route_id: "B41",
          month: "2026-03",
          segment_id: "B41:2026-03:N:1:300001:300002",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 5,
          observation_count: 80,
          bus_trip_count: 200,
        },
      ],
    });

    expect(artifact.summary.busLaneSlowSegmentReviewCount).toBe(1);
    expect(artifact.candidates[0]).toMatchObject({
      candidateKind: "bus_lane_slow_segment_review",
      claimSafeLabel: "issue_needs_review",
      routeId: "B41",
    });
  });
});
