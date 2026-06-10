import { describe, expect, test } from "bun:test";
import {
  type LocalRouteSegmentSpeedCell,
  listRouteSegmentSpeedCells,
  replaceRouteSegmentSpeedCells,
} from "../src/local/index.js";
import { createTestLocalDb } from "./local-test-db.js";

function cellRow(overrides: Partial<LocalRouteSegmentSpeedCell>): LocalRouteSegmentSpeedCell {
  return {
    routeId: "Q63",
    isoMonth: "2026-03",
    timestamp: "2026-03-01T08:00:00.000",
    dayOfWeek: "Weekday",
    hourOfDay: 8,
    direction: "N",
    borough: "Queens",
    routeType: "Local",
    stopOrder: 22,
    timepointStopId: "921855",
    timepointStopName: "39 AV/MAIN ST",
    timepointStopLatitude: 40.7601,
    timepointStopLongitude: -73.8301,
    nextTimepointStopId: "982491",
    nextTimepointStopName: null,
    nextTimepointStopLatitude: null,
    nextTimepointStopLongitude: null,
    roadDistanceMiles: 0.52,
    averageTravelTimeMinutes: 4.2,
    averageRoadSpeedMph: 7.4,
    busTripCount: 6,
    ...overrides,
  };
}

describe("local route segment speed cell repository", () => {
  test("replace and list round-trip preserves nullable timepoint metadata", async () => {
    const { db, sqlite } = createTestLocalDb();
    try {
      const rows = [cellRow({}), cellRow({ hourOfDay: 9, averageRoadSpeedMph: null })];
      replaceRouteSegmentSpeedCells(db, "Q63", "2026-03", rows);
      replaceRouteSegmentSpeedCells(db, "Q63", "2026-03", rows);

      const listed = await listRouteSegmentSpeedCells(db, "Q63", "2026-03");
      expect(listed).toEqual(rows);
    } finally {
      sqlite.close();
    }
  });
});
