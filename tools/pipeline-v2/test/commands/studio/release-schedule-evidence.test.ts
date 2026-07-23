import { describe, expect, test } from "bun:test";
import type { LocalRouteScheduleTimepoint } from "@bp/db/local";
import { refreshRouteBriefScheduleEvidence } from "../../../src/commands/studio/_release-schedule-evidence.ts";
import type { RouteBriefInputArtifact } from "../../../src/commands/studio/_release-types.ts";

describe("Studio release schedule evidence refresh", () => {
  test("refreshes aggregate and hourly evidence from an unambiguous scheduled stop alias", () => {
    const artifact: RouteBriefInputArtifact = {
      metrics: {},
      analysisPeriod: "2026-05",
      segments: [
        {
          segmentId: "Q58:2026-05:W:26:504107:505034",
          direction: "W",
          stopOrder: 26,
          from: "PUTNAM AV/FRESH POND RD",
          to: "PALMETTO ST/MYRTLE AV",
          weightedAverageSpeedMph: 7.8,
          weightedAverageTravelTimeMinutes: 12,
          averageRoadDistanceMiles: 1.32,
          slowWindowPercent: 51.7,
          busTripCount: 40,
          observationCount: 5,
          hotspotScore: 20,
          riderImpactScore: 19,
          ridershipExposure: 100,
          hourlyPassengerDelay: [
            {
              dayOfWeek: "Monday",
              hourOfDay: 8,
              observedTravelTimeMinutes: 12,
              scheduledMedianTravelTimeMinutes: null,
              observedMinusScheduledMinutes: null,
              monthlyRouteRidership: 300,
              serviceDayCount: 5,
              averageServiceDayRouteRidership: 60,
              stopBoardings: null,
              segmentBoardings: null,
              riderDelayHours: 0,
            },
          ],
        },
      ],
      scheduleComparisons: [],
    };
    const schedules: LocalRouteScheduleTimepoint[] = [
      {
        routeId: "Q58",
        isoMonth: "2026-05",
        scheduleDate: "2026-05-04T00:00:00.000",
        dayType: "Weekday",
        direction: "W",
        shapeId: "Q580617",
        stopSequence: 26,
        stopId: "504107",
        stopName: "PUTNAM AV/FRESH POND RD",
        scheduleTime: "2026-05-04T08:00:00.000",
        blockId: "block",
      },
      {
        routeId: "Q58",
        isoMonth: "2026-05",
        scheduleDate: "2026-05-04T00:00:00.000",
        dayType: "Weekday",
        direction: "W",
        shapeId: "Q580617",
        stopSequence: 30,
        stopId: "804230",
        stopName: "PALMETTO ST/MYRTLE AV",
        scheduleTime: "2026-05-04T08:10:00.000",
        blockId: "block",
      },
    ];

    const refreshed = refreshRouteBriefScheduleEvidence(artifact, schedules);

    expect(refreshed.metrics).toMatchObject({
      scheduledPairCount: 1,
      scheduleMatchedHotspotCount: 1,
    });
    expect(refreshed.scheduleComparisons?.[0]).toMatchObject({
      scheduledMedianTravelTimeMinutes: 10,
      scheduledSampleCount: 1,
      observedMinusScheduledMinutes: 2,
    });
    expect(refreshed.segments?.[0]?.hourlyPassengerDelay?.[0]).toMatchObject({
      scheduledMedianTravelTimeMinutes: 10,
      observedMinusScheduledMinutes: 2,
      riderDelayHours: 2,
    });
  });
});
