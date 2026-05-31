import { describe, expect, test } from "bun:test";
import { buildStopDirectionHourEwtFeatures } from "@bp/analytics/features";

describe("buildStopDirectionHourEwtFeatures", () => {
  test("joins observed stop-hour headways to raw scheduled stop-hour baselines", () => {
    const result = buildStopDirectionHourEwtFeatures({
      options: { timezone: "UTC", minHeadways: 3 },
      scheduleTimepoints: [
        schedule("2026-01-05", "08:00"),
        schedule("2026-01-05", "08:10"),
        schedule("2026-01-05", "08:20"),
        schedule("2026-01-06", "08:00"),
        schedule("2026-01-06", "08:10"),
        schedule("2026-01-06", "08:20"),
      ],
      observedHeadways: [
        observed("2026-03-03T08:05:00Z", 4),
        observed("2026-03-03T08:10:00Z", 5),
        observed("2026-03-03T08:20:00Z", 10),
        observed("2026-03-03T08:38:00Z", 18),
      ],
    });

    expect(result.summary).toMatchObject({
      scheduleTimepointCount: 6,
      observedHeadwaySampleCount: 4,
      scheduleBaselineCount: 1,
      featureCount: 1,
      readyFeatureCount: 1,
    });
    expect(result.scheduleBaselines[0]).toMatchObject({
      routeId: "M15",
      dayType: "Weekday",
      direction: "N",
      stopId: "401698",
      localHour: 8,
      serviceDayCount: 2,
      scheduledArrivalCount: 6,
      scheduledBusesPerHour: 3,
      scheduledHeadwayMinutes: 10,
    });
    expect(result.features[0]).toMatchObject({
      scheduledBusesPerHour: 3,
      scheduledHeadwayMinutes: 10,
      observedHeadwaysMinutes: [4, 5, 10, 18],
      observedPairCount: 4,
      quality: {
        coverageStatus: "complete",
        sampleStatus: "supported",
      },
    });
    expect(result.auditRows[0]?.missingDataState).toBe("ready");
  });

  test("keeps observed cells with missing scheduled baseline auditable", () => {
    const result = buildStopDirectionHourEwtFeatures({
      options: { timezone: "UTC", minHeadways: 3 },
      scheduleTimepoints: [schedule("2026-01-05", "08:00")],
      observedHeadways: [
        observed("2026-03-03T09:05:00Z", 4),
        observed("2026-03-03T09:10:00Z", 5),
        observed("2026-03-03T09:20:00Z", 10),
      ],
    });

    expect(result.features[0]).toMatchObject({
      scheduledBusesPerHour: null,
      scheduledHeadwayMinutes: null,
      quality: {
        coverageStatus: "complete",
        sampleStatus: "supported",
      },
    });
    expect(result.auditRows[0]).toMatchObject({
      missingDataState: "baseline_unavailable",
      scheduledBusesPerHour: null,
    });
  });
});

function schedule(scheduleDate: string, hhmm: string) {
  return {
    routeId: "M15",
    dayType: "Weekday",
    direction: "N",
    stopId: "401698",
    stopName: "1 AV/E 42 ST",
    scheduleDate: `${scheduleDate}T00:00:00.000Z`,
    scheduleTime: `${scheduleDate}T${hhmm}:00.000Z`,
  };
}

function observed(isoTimestamp: string, headwayMinutes: number) {
  return {
    routeId: "M15",
    direction: "N",
    stopId: "401698",
    stopName: "1 AV/E 42 ST",
    observedTimestamp: Math.floor(Date.parse(isoTimestamp) / 1000),
    headwayMinutes,
  };
}
