import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { interventionPanelArtifactPath } from "../src/artifacts";
import { buildInterventionPanelArtifact } from "../src/causal";
import { loadInterventionPanelLocalDbRows } from "../src/local-db";

describe("intervention panel artifact", () => {
  test("builds associational panel artifacts from comparison rows", () => {
    const artifact = buildInterventionPanelArtifact({
      rows: [
        {
          route_id: "M15",
          month: "2026-03",
          event_id: "evt-1",
          intervention_type: "bus_lane",
          source_id: "dot_bus_lanes",
          evaluation_level: "route",
          comparison_status: "matched_peer",
          pre_start_month: "2025-03",
          pre_end_month: "2025-08",
          post_start_month: "2026-01",
          post_end_month: "2026-03",
          comparison_route_count: 2,
          comparison_route_ids: "M101, M102",
          speed_delta_mph: 1.2,
          adjusted_speed_delta_mph: 0.8,
          ridership_delta: null,
          adjusted_ridership_delta: null,
          caveat: "Associational screen only.",
        },
        {
          route_id: "M15",
          month: "2026-03",
          event_id: "evt-2",
          intervention_type: "signal_priority",
          source_id: "tsp",
          evaluation_level: "route",
          comparison_status: "no_peer",
          pre_start_month: null,
          pre_end_month: null,
          post_start_month: null,
          post_end_month: null,
          comparison_route_count: 0,
          comparison_route_ids: null,
          speed_delta_mph: null,
          adjusted_speed_delta_mph: null,
          ridership_delta: 12,
          adjusted_ridership_delta: 7,
          caveat: "Missing matched peers.",
        },
      ],
      startMonth: "2026-01",
      endMonth: "2026-03",
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/intervention-panel.json",
    });

    expect(artifact.summary).toEqual({
      panelRowCount: 2,
      routeCount: 1,
      eventCount: 2,
      claimStrength: "associational_screening_only",
    });
    expect(artifact.panels[0]).toMatchObject({
      eventId: "evt-1",
      routeId: "M15",
      comparisonRouteIds: ["M101", "M102"],
      adjustedSpeedDeltaMph: 0.8,
    });
    expect(artifact.panels[1]?.comparisonRouteIds).toEqual([]);
  });

  test("loads panel rows from local SQLite in month order", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_intervention_comparison (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL,
          event_id TEXT NOT NULL,
          intervention_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          evaluation_level TEXT NOT NULL,
          comparison_status TEXT NOT NULL,
          pre_start_month TEXT,
          pre_end_month TEXT,
          post_start_month TEXT,
          post_end_month TEXT,
          comparison_route_count INTEGER NOT NULL,
          comparison_route_ids TEXT,
          speed_delta_mph REAL,
          adjusted_speed_delta_mph REAL,
          ridership_delta REAL,
          adjusted_ridership_delta REAL,
          caveat TEXT NOT NULL
        );
        INSERT INTO local_route_intervention_comparison VALUES
          ('M15', '2026-03', 'evt-2', 'bus_lane', 'dot', 'route', 'matched', NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 'late'),
          ('B1', '2026-01', 'evt-1', 'bus_lane', 'dot', 'route', 'matched', NULL, NULL, NULL, NULL, 1, 'B2', 1.1, 0.9, NULL, NULL, 'early'),
          ('Q44', '2025-12', 'evt-old', 'bus_lane', 'dot', 'route', 'matched', NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 'old');
      `);

      const rows = loadInterventionPanelLocalDbRows({
        sqlite,
        startMonth: "2026-01",
        endMonth: "2026-03",
      });

      expect(rows.map((row) => [row.month, row.route_id, row.event_id])).toEqual([
        ["2026-01", "B1", "evt-1"],
        ["2026-03", "M15", "evt-2"],
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("owns the intervention panel artifact path", () => {
    expect(
      interventionPanelArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
      }),
    ).toBe("data/artifacts/analytics-feature-history/2023-04_to_2026-03/intervention-panel.json");
  });
});
