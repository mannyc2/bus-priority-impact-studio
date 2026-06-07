import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildSegmentMonthPanelV1,
  buildSegmentSpeedResidualArtifactV1,
  SEGMENT_MONTH_PANEL_V1_ID,
} from "../src/feature-resolvers";
import { loadSegmentMonthPanelV1Rows } from "../src/local-db";

describe("segment month panel", () => {
  test("builds expected-speed residuals from segment history and route-month conditions", () => {
    const panel = buildSegmentMonthPanelV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      spec: {
        panelId: SEGMENT_MONTH_PANEL_V1_ID,
        startMonth: "2026-01",
        endMonth: "2026-03",
        minObservationCount: 10,
      },
      rows: [
        {
          route_id: "M1",
          month: "2026-01",
          segment_id: "M1:2026-01:N:1:a:b",
          stable_segment_key: "M1:N:1:a:b",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 10,
          segment_length_feet: 800,
          observation_count: 20,
          bus_trip_count: 100,
        },
        {
          route_id: "M1",
          month: "2026-01",
          segment_id: "M1:2026-01:N:2:b:c",
          stable_segment_key: "M1:N:2:b:c",
          direction: "N",
          stop_order: 2,
          average_speed_mph: 12,
          segment_length_feet: 900,
          observation_count: 20,
          bus_trip_count: 100,
        },
        {
          route_id: "M1",
          month: "2026-02",
          segment_id: "M1:2026-02:N:1:a:b",
          stable_segment_key: "M1:N:1:a:b",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 10,
          segment_length_feet: 800,
          observation_count: 20,
          bus_trip_count: 100,
        },
        {
          route_id: "M1",
          month: "2026-02",
          segment_id: "M1:2026-02:N:2:b:c",
          stable_segment_key: "M1:N:2:b:c",
          direction: "N",
          stop_order: 2,
          average_speed_mph: 12,
          segment_length_feet: 900,
          observation_count: 20,
          bus_trip_count: 100,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:2026-03:N:1:a:b",
          stable_segment_key: "M1:N:1:a:b",
          direction: "N",
          stop_order: 1,
          average_speed_mph: 8,
          segment_length_feet: 800,
          observation_count: 20,
          bus_trip_count: 100,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:2026-03:N:2:b:c",
          stable_segment_key: "M1:N:2:b:c",
          direction: "N",
          stop_order: 2,
          average_speed_mph: 12,
          segment_length_feet: 900,
          observation_count: 20,
          bus_trip_count: 100,
        },
      ],
    });

    expect(panel.summary).toMatchObject({
      sourceRowCount: 6,
      panelRowCount: 6,
      routeCount: 1,
      segmentCount: 2,
      monthCount: 3,
    });
    expect(panel.panelSpec).toMatchObject({
      panelId: "segment_month_panel_v1",
      grain: "route_id + month + direction + stable_segment_key",
      historyWindow: { startMonth: "2026-01", endMonth: "2026-03" },
      releaseFilter: { month: "2026-03" },
    });
    expect(panel.panelSpec.requiredProducts).toEqual([
      expect.objectContaining({
        productId: "local_route_segment_speed_history",
        state: "available",
        role: "source",
      }),
    ]);
    expect(panel.manifest).toMatchObject({
      panelId: "segment_month_panel_v1",
      generatedAt: "2026-06-07T00:00:00.000Z",
      summary: {
        sourceRowCount: 6,
        supportedRowCount: 6,
        panelRowCount: 6,
        routeCount: 1,
        entityCount: 2,
        monthCount: 3,
      },
    });
    expect(panel.manifest.inputRefs).toEqual([
      expect.objectContaining({
        refKind: "local_table",
        refId: "local_route_segment_speed",
      }),
    ]);
    expect(panel.manifest.limitations.length).toBeGreaterThan(0);
    const marchSlowSegment = panel.rows.find((row) => row.segmentId === "M1:2026-03:N:1:a:b");
    expect(marchSlowSegment?.expectedSpeedMph).toBeCloseTo(8.6667, 4);
    expect(marchSlowSegment?.speedResidualMph).toBeCloseTo(-0.6667, 4);
    expect(marchSlowSegment?.residualRankWithinMonth).toBe(1);

    const artifact = buildSegmentSpeedResidualArtifactV1({
      panel,
      releaseMonth: "2026-03",
      generatedAt: "2026-06-07T00:00:00.000Z",
      artifactPath: "segment-speed-residuals.json",
    });
    expect(artifact.summary.modeledReleaseRowCount).toBe(2);
    expect(artifact.panelManifest.summary.panelRowCount).toBe(6);
    expect(artifact.panelManifest.spec.eligibilityRules).toContainEqual(
      expect.objectContaining({
        ruleId: "minimum_observation_count",
        threshold: 10,
      }),
    );
    expect(artifact.rows.map((row) => row.month)).toEqual(["2026-03", "2026-03"]);
  });

  test("loads bounded segment-month rows from local SQLite", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE local_route_segment_speed (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL,
        direction TEXT NOT NULL,
        stop_order INTEGER NOT NULL,
        timepoint_stop_id TEXT NOT NULL,
        next_timepoint_stop_id TEXT NOT NULL,
        average_road_speed_mph REAL NOT NULL,
        average_travel_time_minutes REAL NOT NULL,
        road_distance_miles REAL NOT NULL,
        bus_trip_count INTEGER NOT NULL
      );
      INSERT INTO local_route_segment_speed VALUES
        ('M1', '2026-01', 'N', 1, 'a', 'b', 10, 5, 0.2, 10),
        ('M1', '2026-01', 'N', 1, 'a', 'b', 12, 5, 0.2, 20),
        ('M2', '2026-01', 'S', 1, 'x', 'y', 8, 4, 0.1, 5);
    `);

    const rows = loadSegmentMonthPanelV1Rows({
      sqlite,
      startMonth: "2026-01",
      endMonth: "2026-01",
      routeId: "M1",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      route_id: "M1",
      month: "2026-01",
      segment_id: "M1:2026-01:N:1:a:b",
      stable_segment_key: "M1:N:1:a:b",
      observation_count: 2,
      bus_trip_count: 30,
    });
    expect(rows[0]?.average_speed_mph as number).toBeCloseTo(11.3333, 4);
  });
});
