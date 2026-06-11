import { describe, expect, test } from "bun:test";
import {
  BUNCHING_HOTSPOTS_DETECTOR_ID,
  CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID,
  DEGRADATION_TREND_DETECTOR_ID,
  DELAY_CONCENTRATION_DETECTOR_ID,
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
  TREATMENT_SCOPE_GAP_DETECTOR_ID,
  TREATMENT_SCOPE_MISMATCH_DETECTOR_ID,
} from "@bp/analytics/detectors";
import { ANALYTICS_DETECTOR_REGISTRY } from "@bp/analytics/registry";
import { RouteMonthSignalFeatureSchema } from "@bp/domain/findings";
import {
  DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
  type DetectorStudyMetadata,
  type DetectorStudySourceRows,
  detectorStudyFeatureContractSatisfaction,
  runRegistryDetectorStudy,
  runRegistryDetectorStudyFromResolverPath,
} from "../src/detector-runs";

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";
const RELEASE_MONTH = "2026-03";
const GENERATED_AT = "2026-06-06T00:00:00.000Z";

function metadata(detectorId: string): DetectorStudyMetadata {
  return {
    detectorId,
    detectorRunId: `${detectorId}-${RELEASE_MONTH}-test`,
    releaseMonth: RELEASE_MONTH,
    historyStartMonth: "2023-04",
    generatedAt: GENERATED_AT,
    dbPath: null,
    artifactPath: `${detectorId}-run.json`,
    wroteDb: false,
  };
}

function segmentDaypartResidualRow() {
  return {
    routeId: "M15",
    month: "2026-03",
    segmentId: "M15:N:10:401000:401100",
    directionId: "N",
    daypart: "am_peak",
    averageSpeedMph: 3.75,
    expectedSpeedMph: 8,
    speedResidualMph: -4.25,
    residualPercentileWithinMonthDaypart: 0.05,
    residualRankWithinMonthDaypart: 1,
    residualMonthDaypartCount: 100,
    segmentDaypartHistoryMeanSpeedMph: 7.8,
    segmentDaypartHistoryMedianSpeedMph: 8,
    segmentDaypartHistoryMonthCount: 12,
    routeMonthDaypartMeanSpeedMph: 7,
    routeDaypartHistoryMeanSpeedMph: 8.1,
    observationCount: 2,
    traversalCount: 40,
  };
}

function routePeerResidualRow() {
  return {
    routeId: "M15",
    month: RELEASE_MONTH,
    averageSpeedMph: 4.5,
    expectedSpeedMph: 8,
    speedResidualMph: -3.5,
    residualPercentileWithinMonth: 0.03,
    residualRankWithinMonth: 1,
    residualRouteCount: 100,
    routeHistoryMeanSpeedMph: 5,
    routeHistoryMedianSpeedMph: 5,
    routeHistoryMonthCount: 12,
    networkMonthMeanSpeedMph: 8,
    networkHistoryMeanSpeedMph: 8,
    speedObservationCount: 800,
  };
}

function routeMonthSignalFeature() {
  return RouteMonthSignalFeatureSchema.parse({
    scope: "route",
    scopeId: "M15",
    routeId: "M15",
    month: RELEASE_MONTH,
    window: "all_day",
    direction: null,
    routeWeightedAverageSpeedMph: 4.75,
    speedObservationCount: 900,
    hotspotCount: 4,
    maxHotspotScore: 91,
    ridershipExposure: 10_000,
    permitTouchedEventCount: 40,
    permitTouchCount: 50,
    permitRouteCount: 2,
    permitSources: ["dot_street_permits"],
    contextTouchedEventCount: 80,
    contextTouchCount: 110,
    contextPrimaryTouchCount: 65,
    contextHighConfidenceTouchCount: 30,
    contextEventCounts: [
      {
        sourceId: "dot_street_permits",
        eventKind: "permit",
        touchedEventCount: 40,
        touchCount: 50,
        primaryTouchCount: 35,
        contextTouchCount: 15,
        highConfidenceTouchCount: 20,
        matchWeightSum: 25,
        averageMatchWeight: 0.5,
        maxRouteFanout: 2,
      },
      {
        sourceId: "nyc_311_service_requests_current",
        eventKind: "311_complaint",
        touchedEventCount: 40,
        touchCount: 60,
        primaryTouchCount: 30,
        contextTouchCount: 30,
        highConfidenceTouchCount: 10,
        matchWeightSum: 30,
        averageMatchWeight: 0.5,
        maxRouteFanout: 3,
      },
    ],
    sampleSupport: 900,
    uncertainty: {
      speedObservationCount: 900,
      permitTouchedEventCount: 40,
      contextTouchedEventCount: 80,
      contextHighConfidenceTouchCount: 30,
    },
    provenance: {
      featureComputedAt: GENERATED_AT,
      derivationVersion: "test",
      sourceRefs: [`local_route_month_trend:M15:${RELEASE_MONTH}`],
    },
    coverage: {
      isComputable: true,
      skippedReasonCode: null,
      inputsSeenJson: "{}",
      inputsExpectedJson: "{}",
    },
  });
}

function minimalRowsForDetector(detectorId: string): DetectorStudySourceRows {
  switch (detectorId) {
    case SOURCE_GAP_DETECTOR_ID:
      return {
        sourceGapModelRows: [],
        routeTreatmentFeatureSummary: { sourceKind: "test_empty_treatment_features" },
      };
    case PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID:
      return { persistentSpeedHotspotRoutes: [] };
    case SPEED_PACE_HOTSPOT_DETECTOR_ID:
      return { speedRows: [], segmentDaypartResidualRows: [] };
    case MULTI_MONTH_SPEED_PEER_DETECTOR_ID:
      return { multiMonthSpeedPeerRoutes: [], routePeerResidualRows: [] };
    case OBSERVED_RELIABILITY_DETECTOR_ID:
      return { observedReliabilityRoutes: [] };
    case HEADWAY_RELIABILITY_EWT_DETECTOR_ID:
    case BUNCHING_HOTSPOTS_DETECTOR_ID:
      return { stopDirectionHourFeatures: [], stopDirectionHourSummary: { featureCount: 0 } };
    case RIDER_WEIGHTED_EXCESS_WAIT_DETECTOR_ID:
      return { reliabilityExposurePanelRows: [], stopDirectionHourSummary: { featureCount: 0 } };
    case CUSTOMER_JOURNEY_SHORTFALL_DETECTOR_ID:
      return {
        customerJourneyFeatures: [],
        customerJourneyRouteRollups: [],
        customerJourneySummary: { asOfMonth: RELEASE_MONTH, featureCount: 0 },
      };
    case TRAVEL_TIME_VARIABILITY_DETECTOR_ID:
    case SCHEDULE_MISMATCH_DETECTOR_ID:
      return { observedRuntimeRows: [], scheduledRuntimeRows: [] };
    case DEGRADATION_TREND_DETECTOR_ID:
    case POSITIVE_DEVIANCE_DETECTOR_ID:
      return { routeMetricHistoryRows: [], routePeerResidualRows: [] };
    case INTERVENTION_GAP_DETECTOR_ID:
      return {
        routePainRows: [],
        routeTreatmentFeatures: [],
        sourceGapModelRows: [],
        routeTreatmentFeatureSummary: { featureCount: 0 },
      };
    case INTERVENTION_EVENT_STUDY_DETECTOR_ID:
      return { treatmentEventPanelRows: [] };
    case INTERVENTION_UNDERPERFORMANCE_DETECTOR_ID:
      return {
        routePainRows: [],
        interventionComparisonRows: [],
        routeTreatmentFeatures: [],
        routeSegmentTreatmentFeatures: [],
        routeTreatmentFeatureSummary: { featureCount: 0 },
      };
    case TREATMENT_SCOPE_MISMATCH_DETECTOR_ID:
      return {
        routeSegmentHistoricalSpeedSummaryRows: [],
        segmentSpeedResidualRows: [],
        interventionScopeFitRows: [],
        routeSegmentSpeedSummaryRows: [],
        routeSegmentDaypartSpeedSummaryRows: [],
        routeSegmentTreatmentFeatures: [],
        routeTreatmentFeatureSummary: { featureCount: 0 },
      };
    case TREATMENT_SCOPE_GAP_DETECTOR_ID:
      return {
        routeSegmentHistoricalSpeedSummaryRows: [],
        segmentSpeedResidualRows: [],
        interventionScopeFitRows: [],
        routeSegmentSpeedSummaryRows: [],
        routeSegmentDaypartSpeedSummaryRows: [],
        routeTreatmentFeatures: [],
        routeSegmentTreatmentFeatures: [],
        routeTreatmentFeatureSummary: { featureCount: 0 },
      };
    case PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID:
    case SERVICE_REQUEST_CONTEXT_DETECTOR_ID:
      return {
        routeMonthSignalFeatures: [],
        routeMonthSignalFeatureSummary: {
          sourceKind: "test_empty_route_month_signal_features",
          featureCount: 0,
        },
      };
    case DELAY_CONCENTRATION_DETECTOR_ID:
      return { delayConcentrationSegmentRows: [] };
    default:
      throw new Error(`No minimal detector-study rows registered for ${detectorId}`);
  }
}

describe("registry detector studies", () => {
  test("dispatches every analytics registry detector through the unified study runner", () => {
    const registryDetectorIds = ANALYTICS_DETECTOR_REGISTRY.map((detector) =>
      String(detector.detectorId),
    );
    expect(registryDetectorIds).toHaveLength(21);

    for (const detectorId of registryDetectorIds) {
      const result = runRegistryDetectorStudy({
        metadata: metadata(detectorId),
        rows: minimalRowsForDetector(detectorId),
      });

      expect(result.artifact.detectorId).toBe(detectorId);
      expect(result.artifact.outputSummary.coverageCount).toBe(result.output.coverage.length);
      expect(
        result.artifact.featureContracts.every((contract) => contract.status !== "unsupported"),
      ).toBe(true);
      expect(
        result.artifact.modelDependencies.every((dependency) => dependency.status === "available"),
      ).toBe(true);
    }
  });

  test("runs a detector through applied-research feature resolution and analytics registry dispatch", () => {
    const result = runRegistryDetectorStudy({
      metadata: {
        detectorId: DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {
        segmentDaypartResidualRows: [segmentDaypartResidualRow()],
        speedRows: [
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 8,
            direction: "N",
            stop_order: 10,
            timepoint_stop_id: "401000",
            next_timepoint_stop_id: "401100",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 8,
            average_road_speed_mph: 3.75,
            bus_trip_count: 20,
          },
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 23,
            direction: "N",
            stop_order: 10,
            timepoint_stop_id: "401000",
            next_timepoint_stop_id: "401100",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 2.5,
            average_road_speed_mph: 12,
            bus_trip_count: 20,
          },
          // Downstream terminal segment (highest stop order): free-flowing, so it is gated as
          // terminal and emits no candidate, while keeping the 401000->401100 segment interior.
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 8,
            direction: "N",
            stop_order: 20,
            timepoint_stop_id: "401100",
            next_timepoint_stop_id: "401200",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 2.5,
            average_road_speed_mph: 12,
            bus_trip_count: 20,
          },
          {
            route_id: "M15",
            month: "2026-03",
            hour_of_day: 23,
            direction: "N",
            stop_order: 20,
            timepoint_stop_id: "401100",
            next_timepoint_stop_id: "401200",
            road_distance_miles: 0.5,
            average_travel_time_minutes: 2.5,
            average_road_speed_mph: 12,
            bus_trip_count: 20,
          },
        ],
      },
    });

    expect(result.artifact.detectorId).toBe("speed_pace_hotspot");
    expect(result.artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY]).toBe(4);
    expect(result.output.candidates).toHaveLength(1);
    expect(`${result.output.candidates[0]?.reasonCode}`).toBe("slow_pace_hotspot");
    expect(result.output.coverage.map((row) => `${row.outcome}`)).toContain("hit");
  });

  test("runs through detector-input assembly and derives feature contracts from that resolver path", async () => {
    const detectorId = DEFAULT_REGISTRY_DETECTOR_STUDY_ID;

    const result = await runRegistryDetectorStudyFromResolverPath({
      metadata: metadata(detectorId),
      context: {
        detectorId,
        artifactRoot: "data/artifacts",
        releaseMonth: RELEASE_MONTH,
        historyStartMonth: "2023-04",
        observedRunId: `bus-observatory-${RELEASE_MONTH}`,
      },
      localRows: minimalRowsForDetector(detectorId),
    });

    expect(result.artifact.featureContracts).toEqual(
      detectorStudyFeatureContractSatisfaction({ detectorId }),
    );
    expect(
      result.artifact.featureContracts.every((contract) => contract.status !== "unsupported"),
    ).toBe(true);
    expect(result.artifact.modelDependencies).toEqual([
      {
        modelId: "segment_daypart_residuals_v1",
        status: "available",
        rowCount: 0,
        reason:
          "Required model artifact segment_daypart_residuals_v1 was supplied as segmentDaypartResidualRows.",
      },
    ]);
  });

  test("skips explicitly when a model-backed detector is missing its model artifact rows", () => {
    const result = runRegistryDetectorStudy({
      metadata: {
        detectorId: DEFAULT_REGISTRY_DETECTOR_STUDY_ID,
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-06T00:00:00.000Z",
        dbPath: null,
        artifactPath: "speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {},
    });

    expect(result.output.candidates).toHaveLength(0);
    expect(`${result.output.coverage[0]?.outcome}`).toBe("skipped_missing_input");
    expect(`${result.output.coverage[0]?.reasonCode}`).toBe("missing_model_artifact");
    const { sourceKind } = result.artifact.inputSummary;
    expect(sourceKind).toBe("blocked_missing_model_artifacts");
    expect(result.artifact.modelDependencies[0]).toMatchObject({
      modelId: "segment_daypart_residuals_v1",
      status: "missing",
    });
  });

  test("runs the newly supported detector families through registry dispatch", () => {
    const peerRouteIds = Array.from({ length: 12 }, (_, index) => `Q${index + 1}`);
    const routeMonthFeature = routeMonthSignalFeature();
    const scenarios: Array<{
      detectorId: string;
      rows: DetectorStudySourceRows;
      reasonCode: string;
    }> = [
      {
        detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
        rows: {
          persistentSpeedHotspotRoutes: [
            {
              routeId: "M15",
              hasSpeedData: true,
              speedObservationCount: 1_200,
              segmentCount: 20,
              hotspots: [
                {
                  segmentId: "M15:N:10:401000:401100",
                  hotspotRank: 1,
                  direction: "N",
                  stopOrder: 10,
                  timepointStopName: "Grand St",
                  nextTimepointStopName: "Houston St",
                  observationCount: 80,
                  busTripCount: 160,
                  weightedAverageSpeedMph: 3.75,
                  slowWindowShare: 0.82,
                  speedSeverity: 0.9,
                  hotspotScore: 92,
                  riderImpactScore: 94,
                  ridershipExposure: 8_000,
                },
              ],
            },
          ],
        },
        reasonCode: "persistent_low_speed",
      },
      {
        detectorId: MULTI_MONTH_SPEED_PEER_DETECTOR_ID,
        rows: {
          routePeerResidualRows: [routePeerResidualRow()],
          multiMonthSpeedPeerRoutes: [
            {
              routeId: "M15",
              observations: ["2026-01", "2026-02", RELEASE_MONTH].map((month) => ({
                month,
                hasSpeedTrend: true,
                averageSpeedMph: 4.5,
                speedObservationCount: 800,
                peerMedianSpeedMph: 8,
                peerRouteCount: peerRouteIds.length,
                peerGroupId: "manhattan-high-ridership",
                peerGroupLabel: "Manhattan high-ridership routes",
                peerGroupMethod: "route_family_type",
                peerRouteIds,
              })),
            },
          ],
        },
        reasonCode: "multi_month_peer_speed_deficit",
      },
      {
        detectorId: OBSERVED_RELIABILITY_DETECTOR_ID,
        rows: {
          observedReliabilityRoutes: [
            {
              routeId: "M15",
              reliabilityStatus: "observed",
              sampleCount: 600,
              minSampleThreshold: 100,
              observedLongGapShare: 0.42,
              waitReliabilityRatio: 2.5,
              excessWaitMinutes: 4.2,
              scheduledBaselineHeadwaySampleCount: 12,
              busWaitAssessmentTripCount: 50,
              busWaitAssessment: 0.62,
            },
          ],
        },
        reasonCode: "high_long_gap_share",
      },
      {
        detectorId: PERMIT_CORRELATED_SLOWDOWN_DETECTOR_ID,
        rows: {
          routeMonthSignalFeatures: [routeMonthFeature],
          routeMonthSignalFeatureSummary: {
            sourceKind: "test_route_month_signal_features",
            featureCount: 1,
          },
        },
        reasonCode: "permit_correlated_slowdown",
      },
      {
        detectorId: SERVICE_REQUEST_CONTEXT_DETECTOR_ID,
        rows: {
          routeMonthSignalFeatures: [routeMonthFeature],
          routeMonthSignalFeatureSummary: {
            sourceKind: "test_route_month_signal_features",
            featureCount: 1,
          },
        },
        reasonCode: "service_request_context_slowdown",
      },
    ];

    for (const scenario of scenarios) {
      const result = runRegistryDetectorStudy({
        metadata: metadata(scenario.detectorId),
        rows: scenario.rows,
      });

      expect(result.artifact.detectorId).toBe(scenario.detectorId);
      expect(`${result.output.candidates[0]?.reasonCode}`).toBe(scenario.reasonCode);
      expect(result.output.coverage.map((row) => `${row.outcome}`)).toContain("hit");
      expect(
        result.artifact.featureContracts.every((contract) => contract.status !== "unsupported"),
      ).toBe(true);
    }
  });
});
