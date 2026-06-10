import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleDetectorStudySourceRows,
  detectorStudyFeatureContractSatisfaction,
  detectorStudyNeedsRouteTreatmentFeatures,
  runRegistryDetectorStudy,
} from "@bp/applied-research/detector-runs";
import {
  buildRouteDirectionDaypartFeatures,
  buildRouteMetricHistoryFeatures,
  type InterventionScopeFitRow,
  type RoutePainSourceRow,
  type SegmentDaypartResidualRow,
  type SegmentDaypartSpeedSourceRow,
  type SegmentSpeedResidualRow,
  type SourceGapModelRow,
} from "@bp/applied-research/feature-resolvers";
import { RouteMonthSignalFeatureSchema } from "@bp/domain/findings";
import {
  detectorRunArtifactPath,
  writeDbFlagSchema,
} from "../../../src/commands/findings/run-detector.ts";

describe("writeDb flag parsing", () => {
  test("only explicit true/1 (or boolean true) enables the destructive write", () => {
    expect(writeDbFlagSchema.parse(undefined)).toBe(false);
    expect(writeDbFlagSchema.parse("false")).toBe(false); // the footgun: must NOT be true
    expect(writeDbFlagSchema.parse("0")).toBe(false);
    expect(writeDbFlagSchema.parse("")).toBe(false);
    expect(writeDbFlagSchema.parse(false)).toBe(false);
    expect(writeDbFlagSchema.parse("true")).toBe(true);
    expect(writeDbFlagSchema.parse("1")).toBe(true);
    expect(writeDbFlagSchema.parse(true)).toBe(true);
  });
});

const FEATURE_COUNT_SUMMARY_KEY = "featureCount";

function speedRow(input: {
  routeId?: string;
  hour: number;
  travelTime: number;
  speed: number;
  trips?: number;
}): SegmentDaypartSpeedSourceRow {
  return {
    route_id: input.routeId ?? "M15",
    month: "2026-03",
    hour_of_day: input.hour,
    direction: "0",
    stop_order: 10,
    timepoint_stop_id: "s1",
    next_timepoint_stop_id: "s2",
    road_distance_miles: 1,
    average_travel_time_minutes: input.travelTime,
    average_road_speed_mph: input.speed,
    bus_trip_count: input.trips ?? 20,
  };
}

// Highest-stop-order segment: free-flowing, so it is gated as terminal and emits no candidate, while
// keeping the s1->s2 segment interior (non-terminal) so the slow-pace gate still applies there.
function downstreamSpeedRow(input: { hour: number }): SegmentDaypartSpeedSourceRow {
  return {
    ...speedRow({ hour: input.hour, travelTime: 5, speed: 12 }),
    stop_order: 20,
    timepoint_stop_id: "s2",
    next_timepoint_stop_id: "s3",
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

function routeMonthSignalFeature(routeId: string) {
  return RouteMonthSignalFeatureSchema.parse({
    scope: "route",
    scopeId: routeId,
    routeId,
    month: "2026-03",
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
      featureComputedAt: "2026-06-01T00:00:00.000Z",
      derivationVersion: "test",
      sourceRefs: [`local_route_month_trend:${routeId}:2026-03`],
    },
    coverage: {
      isComputable: true,
      skippedReasonCode: null,
      inputsSeenJson: "{}",
      inputsExpectedJson: "{}",
    },
  });
}

function segmentDaypartResidualRow(
  over: Partial<SegmentDaypartResidualRow> = {},
): SegmentDaypartResidualRow {
  return {
    routeId: "M15",
    month: "2026-03",
    segmentId: "M15:0:10:s1:s2",
    directionId: "0",
    daypart: "am_peak",
    averageSpeedMph: 3.75,
    expectedSpeedMph: 8,
    speedResidualMph: -4.25,
    residualPercentileWithinMonthDaypart: 0.05,
    residualRankWithinMonthDaypart: 1,
    residualMonthDaypartCount: 100,
    segmentDaypartHistoryMeanSpeedMph: 7.9,
    segmentDaypartHistoryMedianSpeedMph: 8,
    segmentDaypartHistoryMonthCount: 12,
    routeMonthDaypartMeanSpeedMph: 7,
    routeDaypartHistoryMeanSpeedMph: 8.1,
    observationCount: 2,
    traversalCount: 40,
    ...over,
  };
}

function sourceGapModelRow(over: Partial<SourceGapModelRow> = {}): SourceGapModelRow {
  return {
    routeId: "M57",
    month: "2026-03",
    treatmentType: "transit_signal_priority",
    gapKind: "current_inventory_missing",
    sourceGapCount: 1,
    blocksClaims: ["tsp_absence"],
    sourceRefs: ["source_gap:tsp_current_route_intersection_inventory"],
    publicStatements: ["Current route-level TSP inventory is not published."],
    ...over,
  };
}

function segmentSpeedResidualRow(
  over: Partial<SegmentSpeedResidualRow> = {},
): SegmentSpeedResidualRow {
  return {
    routeId: "M96",
    month: "2026-03",
    segmentId: "M96:2026-03:W:10:401965:903004",
    stableSegmentKey: "M96:W:10:401965:903004",
    directionId: "W",
    stopOrder: 10,
    directionMaxStopOrder: 25,
    isTerminalSegment: false,
    averageSpeedMph: 4.9,
    expectedSpeedMph: 8.2,
    speedResidualMph: -3.3,
    residualPercentileWithinMonth: 0.04,
    residualRankWithinMonth: 1,
    residualMonthCount: 1200,
    segmentHistoryMeanSpeedMph: 8.1,
    segmentHistoryMedianSpeedMph: 8,
    segmentHistoryMonthCount: 12,
    routeMonthMeanSpeedMph: 6.5,
    routeHistoryMeanSpeedMph: 7.4,
    observationCount: 90,
    busTripCount: 300,
    ...over,
  };
}

function interventionScopeFitRow(
  over: Partial<InterventionScopeFitRow> = {},
): InterventionScopeFitRow {
  return {
    routeId: "M96",
    month: "2026-03",
    treatmentType: "bus_lane",
    segmentId: "M96:2026-03:W:10:401965:903004",
    directionId: "W",
    segmentOrder: 10,
    fitStatus: "covered",
    matchMethod: "route_shape_overlap",
    overlapShare: 0.7,
    routePositiveTreatmentCount: 1,
    segmentPositiveTreatmentCount: 1,
    sourceGapCount: 0,
    sourceGapKinds: [],
    blocksClaims: [],
    sourceRefs: ["bus-lane-segment:M96"],
    ...over,
  };
}

describe("findings run-detector", () => {
  test("assembles model artifact rows through the detector resolver registry", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "bp-detector-assembly-"));
    try {
      const artifactPath = join(
        artifactRoot,
        "analytics-models",
        "segment-daypart-residuals-v1",
        "2023-04_to_2026-03",
        "2026-03",
        "segment-daypart-residuals.json",
      );
      await Bun.write(
        artifactPath,
        JSON.stringify({
          artifactKind: "segment_daypart_residuals_v1",
          schemaVersion: 1,
          rows: [
            segmentDaypartResidualRow({ routeId: "M15" }),
            segmentDaypartResidualRow({ routeId: "B41" }),
          ],
        }),
      );

      const rows = await assembleDetectorStudySourceRows({
        context: {
          detectorId: "speed_pace_hotspot",
          artifactRoot,
          releaseMonth: "2026-03",
          historyStartMonth: "2023-04",
          observedRunId: "bus-observatory-2026-03",
          routeId: "B41",
        },
        localRows: {
          speedRows: [speedRow({ routeId: "B41", hour: 8, travelTime: 16, speed: 3.75 })],
        },
      });

      expect(rows.speedRows).toHaveLength(1);
      expect(rows.segmentDaypartResidualRows?.map((row) => row.routeId)).toEqual(["B41"]);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("assembles route-month signal features through the detector resolver registry", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "bp-signal-feature-assembly-"));
    try {
      await Bun.write(
        join(artifactRoot, "findings", "2026-03", "signal-features.json"),
        JSON.stringify({
          artifactKind: "finding_signal_features",
          schemaVersion: 1,
          month: "2026-03",
          generatedAt: "2026-06-01T00:00:00.000Z",
          featureGrain: {
            scope: ["route"],
            window: ["all_day"],
            direction: "nullable",
          },
          summary: {
            featureCount: 2,
            computableFeatureCount: 2,
            permitTouchedFeatureCount: 2,
            contextTouchedFeatureCount: 2,
            contextSourceCount: 2,
            detectorCandidateCount: 0,
          },
          features: [routeMonthSignalFeature("M15"), routeMonthSignalFeature("B41")],
          detectorPreview: {
            candidates: [],
            evidence: [],
            coverage: [],
          },
        }),
      );

      const rows = await assembleDetectorStudySourceRows({
        context: {
          detectorId: "service_request_context",
          artifactRoot,
          releaseMonth: "2026-03",
          historyStartMonth: "2023-04",
          observedRunId: "bus-observatory-2026-03",
          routeId: "B41",
        },
        localRows: {},
      });

      expect(rows.routeMonthSignalFeatures?.map((feature) => `${feature.routeId}`)).toEqual([
        "B41",
      ]);
      expect(rows.routeMonthSignalFeatureSummary?.["sourceKind"]).toBe(
        "route_month_signal_features_artifact",
      );
      expect(rows.routeMonthSignalFeatureSummary?.["featureCount"]).toBe(2);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("runs speed_pace_hotspot through feature contracts", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "speed_pace_hotspot",
        detectorRunId: "speed_pace_hotspot-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json",
        wroteDb: false,
      },
      rows: {
        segmentDaypartResidualRows: [segmentDaypartResidualRow()],
        speedRows: [
          speedRow({ hour: 8, travelTime: 16, speed: 3.75 }),
          speedRow({ hour: 12, travelTime: 5, speed: 12 }),
          downstreamSpeedRow({ hour: 8 }),
          downstreamSpeedRow({ hour: 12 }),
        ],
      },
    });

    expect(artifact.artifactKind).toBe("registry_detector_run");
    expect(artifact.detectorId).toBe("speed_pace_hotspot");
    expect(artifact.featureContracts.map((contract) => contract.status)).toEqual([
      "resolved",
      "satisfied_by_feature_quality",
    ]);
    expect(artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY]).toBe(4);
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(artifact.outputSummary.coverageCount).toBe(4);
    expect(artifact.outputSummary.hitCount).toBe(1);
    expect(output.candidates[0]?.scopeKind as string | undefined).toBe("segment");
    expect(output.evidence.map((row) => row.evidenceRole as string)).toEqual([
      "primary",
      "counter_evidence",
    ]);
  });

  test("uses the detector run artifact namespace", () => {
    expect(
      detectorRunArtifactPath({
        artifactRoot: "data/artifacts",
        releaseMonth: "2026-03",
        detectorId: "speed_pace_hotspot",
      }),
    ).toBe("data/artifacts/detector-runs/2026-03/speed_pace_hotspot-run.json");
  });

  test("marks treatment feature contracts as resolvable for intervention detectors", () => {
    expect(detectorStudyNeedsRouteTreatmentFeatures("intervention_gap")).toBe(true);
    expect(detectorStudyNeedsRouteTreatmentFeatures("intervention_underperformance")).toBe(true);
    expect(detectorStudyNeedsRouteTreatmentFeatures("source_gap")).toBe(true);
    expect(detectorStudyNeedsRouteTreatmentFeatures("speed_pace_hotspot")).toBe(false);

    const interventionGapContracts = detectorStudyFeatureContractSatisfaction({
      detectorId: "intervention_gap",
    });
    expect(
      interventionGapContracts
        .filter((contract) => contract.featureGrain.startsWith("route_treatment"))
        .map((contract) => contract.status),
    ).toEqual(["resolved", "resolved"]);

    const underperformanceContracts = detectorStudyFeatureContractSatisfaction({
      detectorId: "intervention_underperformance",
    });
    expect(
      underperformanceContracts
        .filter((contract) => contract.featureGrain.includes("treatment_summary"))
        .map((contract) => contract.status),
    ).toEqual(["resolved", "resolved"]);
  });

  test("runs intervention_gap from route pain and treatment source-gap features", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "intervention_gap",
        detectorRunId: "intervention_gap-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/intervention_gap-run.json",
        wroteDb: false,
      },
      rows: {
        routePainRows: [routePainRow()],
        routeTreatmentFeatures: [],
        routeSegmentTreatmentFeatures: [],
        sourceGapModelRows: [sourceGapModelRow()],
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
      },
    });

    const { sourceKind } = artifact.inputSummary;
    expect(sourceKind).toBe("intervention_gap_from_source_gap_model_v1");
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(output.candidates[0]?.reasonCode as string | undefined).toBe("intervention_gap");
    expect(output.coverage[0]?.outcome as string | undefined).toBe("hit");
  });

  test("runs intervention_underperformance with treatment evidence in output evidence", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "intervention_underperformance",
        detectorRunId: "intervention_underperformance-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/intervention_underperformance-run.json",
        wroteDb: false,
      },
      rows: {
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
        routeSegmentTreatmentFeatures: [],
        routeTreatmentSourceGapFeatures: [],
      },
    });

    const { sourceKind } = artifact.inputSummary;
    expect(sourceKind).toBe(
      "intervention_underperformance_from_route_pain_intervention_comparisons_and_treatment_summary",
    );
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(output.candidates[0]?.reasonCode as string | undefined).toBe(
      "negative_peer_adjusted_delta",
    );
    const primaryEvidence = output.evidence.find((row) => row.evidenceRole === "primary");
    expect(primaryEvidence?.evidenceRef).toContain('"routeTreatmentEvidenceCount":1');
  });

  test("runs treatment_scope_mismatch from segment speed and treatment features", () => {
    const { artifact, output } = runRegistryDetectorStudy({
      metadata: {
        detectorId: "treatment_scope_mismatch",
        detectorRunId: "treatment_scope_mismatch-2026-03-test",
        releaseMonth: "2026-03",
        historyStartMonth: "2023-04",
        generatedAt: "2026-06-01T00:00:00.000Z",
        dbPath: "data/local/pipeline.sqlite",
        artifactPath: "data/artifacts/detector-runs/2026-03/treatment_scope_mismatch-run.json",
        wroteDb: false,
      },
      rows: {
        routeSegmentSpeedSummaryRows: [
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
            average_speed_mph: 7.5,
            segment_length_feet: 650,
            observation_count: 100,
            bus_trip_count: 340,
          },
        ],
        routeSegmentDaypartSpeedSummaryRows: [
          {
            route_id: "M96",
            month: "2026-03",
            segment_id: "M96:2026-03:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            daypart: "am_peak",
            average_speed_mph: 4.3,
            observation_count: 12,
            bus_trip_count: 120,
          },
          {
            route_id: "M96",
            month: "2026-03",
            segment_id: "M96:2026-03:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            daypart: "pm_peak",
            average_speed_mph: 5.2,
            observation_count: 10,
            bus_trip_count: 90,
          },
        ],
        routeSegmentHistoricalSpeedSummaryRows: [
          {
            route_id: "M96",
            month: "2025-12",
            segment_id: "M96:2025-12:W:10:401965:903004",
            stable_segment_key: "M96:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            average_speed_mph: 8.2,
            segment_length_feet: 500,
            observation_count: 120,
            bus_trip_count: 360,
          },
          {
            route_id: "M96",
            month: "2026-01",
            segment_id: "M96:2026-01:W:10:401965:903004",
            stable_segment_key: "M96:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            average_speed_mph: 8,
            segment_length_feet: 500,
            observation_count: 120,
            bus_trip_count: 360,
          },
          {
            route_id: "M96",
            month: "2026-02",
            segment_id: "M96:2026-02:W:10:401965:903004",
            stable_segment_key: "M96:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            average_speed_mph: 7.8,
            segment_length_feet: 500,
            observation_count: 120,
            bus_trip_count: 360,
          },
          {
            route_id: "M96",
            month: "2026-03",
            segment_id: "M96:2026-03:W:10:401965:903004",
            stable_segment_key: "M96:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            average_speed_mph: 4.9,
            segment_length_feet: 500,
            observation_count: 90,
            bus_trip_count: 300,
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
        segmentSpeedResidualRows: [segmentSpeedResidualRow()],
        interventionScopeFitRows: [interventionScopeFitRow()],
      },
    });

    const { sourceKind } = artifact.inputSummary;
    expect(sourceKind).toBe("treatment_scope_mismatch_from_segment_speed_and_treatment_summary");
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(output.candidates[0]?.detectorId as string | undefined).toBe("treatment_scope_mismatch");
    expect(output.candidates[0]?.scopeKind as string | undefined).toBe("segment");
    expect(output.evidence.find((row) => row.evidenceRole === "context")?.evidenceRef).toContain(
      '"slowestDaypart":"am_peak"',
    );
  });

  test("builds route-direction-daypart runtime features for schedule and variability detectors", () => {
    const result = buildRouteDirectionDaypartFeatures({
      observedRows: [
        {
          route_id: "M15",
          month: "2026-03",
          direction: "N",
          daypart: "am_peak",
          runtime_minutes: 50,
          observed_trip_count: 12,
        },
        {
          route_id: "M15",
          month: "2026-03",
          direction: "N",
          daypart: "am_peak",
          runtime_minutes: 70,
          observed_trip_count: 12,
        },
      ],
      scheduledRows: [
        { route_id: "M15", direction: "N", daypart: "am_peak", runtime_minutes: 45 },
        { route_id: "M15", direction: "N", daypart: "am_peak", runtime_minutes: 55 },
      ],
      minObservedTrips: 10,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.scheduledRuntimeMinutes).toBe(50);
    expect(result.features[0]?.observedRuntimeP50Minutes).toBe(60);
    expect(result.features[0]?.observedRuntimeP95Minutes).toBe(69);
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
  });

  test("builds route metric history features for degradation trend execution", () => {
    const result = buildRouteMetricHistoryFeatures({
      releaseMonth: "2026-03",
      historyStartMonth: "2026-01",
      minHistoryPoints: 3,
      rows: [
        {
          route_id: "M15",
          month: "2026-01",
          speed_observation_count: 100,
          average_speed_mph: 8,
        },
        {
          route_id: "M15",
          month: "2026-02",
          speed_observation_count: 100,
          average_speed_mph: 7,
        },
        {
          route_id: "M15",
          month: "2026-03",
          speed_observation_count: 100,
          average_speed_mph: 6,
        },
      ],
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.metricName).toBe("average_speed_mph");
    expect(result.features[0]?.quality.sampleStatus).toBe("supported");
    expect(result.features[0]?.points.map((point) => point.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });
});
