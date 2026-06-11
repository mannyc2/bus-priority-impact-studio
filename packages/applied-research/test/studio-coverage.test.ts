import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  auditProjectionSegmentHourBins,
  auditRouteBriefInputHourlyBins,
  hasDotRouteLaneCoverage,
  hasValidRidershipProfile,
  hasValidTrendMonthLabels,
} from "../src/evaluation";

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const ridershipWindow = {
  dayOfWeek: "weekday",
  hourOfDay: 8,
  ridership: 100,
  transfers: 2,
  matchedObservationCount: 12,
  busTripCount: 3,
  weightedAverageSpeedMph: 7.5,
  slowObservationShare: 0.4,
};

const validRidershipProfile = {
  peakRidershipWindow: ridershipWindow,
  topRidershipWindows: [ridershipWindow],
  slowCrowdedWindows: [],
};

const validLaneEvidence = {
  lane: "partial",
  laneSource: "dot_bus_lanes_geometry",
  laneOverlapShare: 0.5,
  laneMatchedCount: 1,
  laneTypes: ["offset"],
  laneOperatingHours: ["7-10"],
  laneOperatingDays: ["weekday"],
};

const validRouteShape = {
  segmentGeometrySource: "mta_route_shape_timepoint_slice",
  segmentGeometryMethod: "timepoint_stop_projection_to_route_shape",
  segmentGeometry: {
    type: "LineString",
    coordinates: [
      [-73.95, 40.7],
      [-73.94, 40.71],
    ],
  },
};

const validTspEvidence = {
  tspStatus: "unknown",
  tspSource: "not_in_ingested_tsp_sources",
  tspSourceDate: null,
  tspSourceUrl: null,
  tspCorridor: null,
  tspMatchMethod: "not_matched_in_ingested_sources",
};

const validDelayEvidence = {
  scheduledMedianTravelTimeMinutes: 12,
  scheduledSpeedMph: 6,
  observedMinusScheduledMinutes: 3,
  scheduledSampleCount: 7,
  ridershipExposure: 40,
  riderDelayHours: 2,
  hourlyPassengerDelay: [
    {
      averageServiceDayRouteRidership: 100,
      monthlyRouteRidership: 2_000,
      serviceDayCount: 20,
      riderDelayHours: 2,
      stopBoardings: null,
      segmentBoardings: null,
    },
  ],
  stopBoardings: null,
  segmentBoardings: null,
};

describe("Studio coverage evaluation", () => {
  test("audits route brief input hourly bins and schedule-comparison coverage", async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), "bp-studio-coverage-"));
    try {
      await writeJson(
        join(artifactRoot, "route-slices", "b44-2026-03", "route-brief-input.json"),
        {
          topSegments: [
            {
              segmentId: "seg-1",
              hourlySlowWindowBins: Array.from({ length: 24 }, (_, hour) => hour),
              ridershipExposure: 20,
            },
            {
              segmentId: "seg-2",
              hourlySlowWindowBins: [8, 9],
            },
            {
              segmentId: "seg-3",
            },
          ],
          scheduleComparisons: [
            {
              segmentId: "seg-1",
              scheduledMedianTravelTimeMinutes: 10,
              observedMinusScheduledMinutes: 2,
              scheduledSampleCount: 5,
            },
            {
              segmentId: "seg-2",
              scheduledMedianTravelTimeMinutes: 0,
              observedMinusScheduledMinutes: 1,
              scheduledSampleCount: 0,
            },
          ],
        },
      );

      const audit = await auditRouteBriefInputHourlyBins({
        artifactRoot,
        isoMonth: "2026-03",
        routeIds: ["M1", "B44"],
      });

      expect(audit.routeInputCount).toBe(1);
      expect(audit.scheduleComparisonCount).toBe(2);
      expect(audit.segmentsWith24HourlyBins).toBe(1);
      expect(audit.segmentsWithLegacyHourlyBins).toBe(1);
      expect(audit.segmentsMissingHourlyBins).toBe(1);
      expect(audit.segmentsWithCompleteScheduleComparisons).toBe(1);
      expect(audit.segmentsWithIncompleteScheduleComparisons).toBe(1);
      expect(audit.segmentsMissingScheduleComparisons).toBe(1);
      expect(audit.routesMissingBriefInput).toEqual(["M1"]);
      expect(audit.routesWithIncompleteScheduleComparisons).toEqual(["B44"]);
      expect(audit.routesWithSegmentsMissingScheduleComparisons).toEqual(["B44"]);
      expect(audit.routesWithMissingRidershipExposure).toEqual(["B44"]);
    } finally {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  });

  test("audits Studio route projection geometry, evidence, profile, and coverage policy", async () => {
    const studioRoot = await mkdtemp(join(tmpdir(), "bp-studio-projection-"));
    try {
      const routeDir = join(studioRoot, "routes", "b44");
      await writeJson(join(routeDir, "index.json"), {
        route: { routeId: "B44", ridershipProfile: validRidershipProfile },
        segments: [
          {
            id: "seg-1",
            hours: Array.from({ length: 24 }, (_, hour) => hour),
            ...validLaneEvidence,
            ...validRouteShape,
            ...validTspEvidence,
          },
          {
            id: "seg-2",
            hours: [8, 9],
            lane: "yes",
          },
        ],
      });
      await writeJson(join(routeDir, "segments.json"), {
        coverage: {
          scope: "full_route_observed_timepoint_segments",
          segmentUniverse: "all_observed_timepoint_segments",
          riderDelayMetric:
            "positive_observed_minus_scheduled_minutes_times_average_service_day_route_hourly_ridership",
          riderDelayAggregation: "segment_hour_service_day_hours",
          ridershipDenominator: "average_service_day_route_hourly_ridership",
          serviceDayRidershipCoverage: "available",
          stopBoardingsCoverage: "not_available",
          segmentBoardingsCoverage: "not_available",
          hourlyRiderDelayCoverage: "available",
          fullRouteCoverage: true,
          multiMonthWindowCoverage: "single_release_month",
          unavailableCoverageReasons: [
            "multi_month_window_projection_pending",
            "stop_level_boardings_unavailable",
            "segment_level_boardings_unavailable",
          ],
          totalRouteSegmentRows: 2,
          returnedSegmentRows: 2,
          windowMonthCount: 1,
        },
        segments: [
          {
            id: "seg-1",
            ...validLaneEvidence,
            ...validRouteShape,
            ...validTspEvidence,
            ...validDelayEvidence,
          },
          { id: "seg-2" },
        ],
      });

      const audit = await auditProjectionSegmentHourBins({
        studioRoot,
        routeDirs: ["b44"],
      });

      expect(audit.routeDetailsWithRidershipProfile).toBe(1);
      expect(audit.segmentCount).toBe(2);
      expect(audit.segmentsWith24HourBins).toBe(1);
      expect(audit.segmentsWithInvalidHourBins).toBe(1);
      expect(audit.segmentsWithDotLaneGeometry).toBe(1);
      expect(audit.segmentsWithInvalidLaneGeometry).toBe(1);
      expect(audit.routeSegmentResponsesWithCoverageMetadata).toBe(1);
      expect(audit.routeSegmentEvidenceWithCompleteRiderDelay).toBe(1);
      expect(audit.routeSegmentEvidenceWithInvalidRiderDelay).toBe(1);
      expect(audit.invalidSegmentRefs).toEqual(["b44:seg-2"]);
      expect(audit.invalidRouteSegmentEvidenceRiderDelayRefs).toEqual(["b44:segments:seg-2"]);
    } finally {
      await rm(studioRoot, { recursive: true, force: true });
    }
  });

  test("exposes list-level route projection validators from applied research", () => {
    expect(
      hasDotRouteLaneCoverage({
        laneCoverage: 50,
        laneCoverageSource: "dot_bus_lanes_geometry",
        laneTypes: ["offset"],
        laneOperatingHours: ["7-10"],
        laneOperatingDays: ["weekday"],
      }),
    ).toBe(true);
    expect(
      hasValidTrendMonthLabels({
        spark: [7, 8],
        sparkMonths: ["2026-02", "2026-03"],
        ridershipSpark: [100, 120],
        ridershipSparkMonths: ["2026-02", "2026-03"],
      }),
    ).toBe(true);
    expect(hasValidRidershipProfile({ ridershipProfile: validRidershipProfile })).toBe(true);
  });
});
