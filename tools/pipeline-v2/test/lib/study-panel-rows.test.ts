import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
  loadStudyPanelRouteIds,
  loadStudyPanelSourceRows,
} from "../../src/lib/local-db-aggregates/study-panel-rows.ts";

describe("study panel local-db rows", () => {
  const databases: Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  test("aggregates day-of-week cells at route, segment, month, and hour grain", () => {
    const sqlite = new Database(":memory:");
    databases.push(sqlite);
    sqlite.run(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        direction TEXT NOT NULL,
        stop_order INTEGER NOT NULL,
        timepoint_stop_id TEXT,
        next_timepoint_stop_id TEXT,
        hour_of_day INTEGER NOT NULL,
        borough TEXT NOT NULL,
        average_road_speed_mph REAL NOT NULL,
        bus_trip_count INTEGER NOT NULL,
        day_of_week TEXT NOT NULL
      )
    `);
    const insert = sqlite.query(`
      INSERT INTO local_route_segment_speed (
        route_id, month, direction, stop_order, timepoint_stop_id,
        next_timepoint_stop_id, hour_of_day, borough,
        average_road_speed_mph, bus_trip_count, day_of_week
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("M15", "2025-01", "N", 1, "a", "b", 8, "Manhattan", 6, 10, "Monday");
    insert.run("M15", "2025-01", "N", 1, "a", "b", 8, "Manhattan", 10, 30, "Tuesday");
    insert.run("M15", "2025-01", "N", 1, "a", "b", 9, "Manhattan", 7, 5, "Monday");
    insert.run("M15", "2025-02", "N", 1, "a", "b", 8, "Manhattan", 8, 20, "Monday");
    insert.run("B41", "2025-01", "N", 1, "x", "y", 8, "Brooklyn", 9, 20, "Monday");
    insert.run("M15", "2025-01", "N", 2, null, "c", 8, "Manhattan", 9, 20, "Monday");
    insert.run("M15", "2025-01", "N", 3, "c", "d", 8, "Manhattan", 9, 0, "Monday");

    const rows = loadStudyPanelSourceRows({
      sqlite,
      startMonth: "2025-01",
      endMonth: "2025-01",
      routeIds: [" m15 ", "M15"],
    });

    expect(rows).toEqual([
      {
        routeId: "M15",
        month: "2025-01",
        direction: "N",
        stopOrder: 1,
        fromStopId: "a",
        toStopId: "b",
        hourOfDay: 8,
        borough: "Manhattan",
        averageSpeedMph: 9,
        busTripCount: 40,
      },
      {
        routeId: "M15",
        month: "2025-01",
        direction: "N",
        stopOrder: 1,
        fromStopId: "a",
        toStopId: "b",
        hourOfDay: 9,
        borough: "Manhattan",
        averageSpeedMph: 7,
        busTripCount: 5,
      },
    ]);
    expect(
      loadStudyPanelRouteIds({
        sqlite,
        startMonth: "2025-01",
        endMonth: "2025-01",
        boroughs: ["Manhattan"],
      }),
    ).toEqual(["M15"]);
  });

  test("does not query when the normalized route list is empty", () => {
    const sqlite = new Database(":memory:");
    databases.push(sqlite);
    expect(
      loadStudyPanelSourceRows({
        sqlite,
        startMonth: "2025-01",
        endMonth: "2025-02",
        routeIds: ["  "],
      }),
    ).toEqual([]);
  });
});
