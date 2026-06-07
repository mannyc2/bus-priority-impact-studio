import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assembleDetectorStudySourceRows,
  detectorFeatureContractSatisfaction,
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
import { detectorRunArtifactPath } from "../../../src/commands/findings/run-detector.ts";

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
        ],
      },
    });

    expect(artifact.artifactKind).toBe("registry_detector_run");
    expect(artifact.detectorId).toBe("speed_pace_hotspot");
    expect(artifact.featureContracts.map((contract) => contract.status)).toEqual([
      "resolved",
      "satisfied_by_feature_quality",
    ]);
    expect(artifact.inputSummary[FEATURE_COUNT_SUMMARY_KEY]).toBe(2);
    expect(artifact.outputSummary.candidateCount).toBe(1);
    expect(artifact.outputSummary.coverageCount).toBe(2);
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

    const interventionGapContracts = detectorFeatureContractSatisfaction("intervention_gap");
    expect(
      interventionGapContracts
        .filter((contract) => contract.featureGrain.startsWith("route_treatment"))
        .map((contract) => contract.status),
    ).toEqual(["resolved", "resolved"]);

    const underperformanceContracts = detectorFeatureContractSatisfaction(
      "intervention_underperformance",
    );
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
            month: "2025-03",
            segment_id: "M96:2025-03:W:10:401965:903004",
            stable_segment_key: "M96:W:10:401965:903004",
            direction: "W",
            stop_order: 10,
            average_speed_mph: 8.1,
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
