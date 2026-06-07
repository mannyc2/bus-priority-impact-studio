import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { routeTreatmentSummaryArtifactPath, routeTreatmentSummaryMarkdownPath } from "../src/artifacts";
import { loadRouteTreatmentSummaryLocalDbRows } from "../src/local-db";
import {
  buildRouteTreatmentSummaryArtifact,
  routeTreatmentSourceRowsFromAce,
  routeTreatmentSourceRowsFromInterventionEvents,
  routeTreatmentSourceRowsFromPublishableInterventions,
  routeTreatmentSourceRowsFromRouteBriefSummaries,
  routeTreatmentSummaryMarkdown,
  segmentTreatmentRowsFromLaneOverlaps,
} from "../src/treatments";

describe("route treatment summary", () => {
  test("builds all-route treatment rows without treating missing TSP inventory as absence", () => {
    const evidenceRows = [
      ...routeTreatmentSourceRowsFromAce({
        month: "2026-03",
        rows: [{ route_id: "B41", program: "ACE", implementation_date: "2025-12-01" }],
      }),
      ...routeTreatmentSourceRowsFromRouteBriefSummaries({
        month: "2026-03",
        rows: [
          {
            route_id: "B41",
            month: "2026-03",
            bus_lane_matched_lane_count: 3,
            ace_active: 1,
          },
        ],
      }),
      ...routeTreatmentSourceRowsFromInterventionEvents({
        month: "2026-03",
        rows: [
          {
            event_id: "bus-lane-source-gap:B41:2026-03",
            route_id: "B41",
            intervention_type: "bus_lane_infrastructure",
            source_id: "nyc_dot_bus_lanes",
            program: "NYC DOT Bus Lanes",
            implementation_date: "2026-03-01T00:00:00.000Z",
            implementation_month: "2026-03",
            event_status: "source_gap",
            description: "Some matched lane segments lack parseable open dates.",
          },
        ],
      }),
      ...routeTreatmentSourceRowsFromPublishableInterventions({
        month: "2026-03",
        rows: [
          {
            recordId: "record-1",
            sourceId: "tier2-source",
            status: "implemented",
            routes: ["Q66"],
            primaryTreatments: ["queue_jump"],
            effectiveDate: "2024-09",
            datePrecision: "month",
            timelineLayer: "canonical_milestone",
            evidenceCandidateIds: ["candidate-1"],
          },
        ],
      }),
    ];

    const artifact = buildRouteTreatmentSummaryArtifact({
      month: "2026-03",
      routeIds: ["B41", "Q66"],
      evidenceRows,
      segmentTreatmentRows: segmentTreatmentRowsFromLaneOverlaps({
        rows: [
          {
            routeId: "B41",
            month: "2026-03",
            segmentId: "B41:2026-03:N:1:300001:300002",
            directionId: "N",
            segmentOrder: 1,
            laneSource: "dot_bus_lanes_geometry",
            laneOverlapShare: 0.72,
            laneMatchedCount: 2,
            laneTypes: ["Offset Bus Lane"],
            laneOperatingHours: ["7 AM - 7 PM"],
            laneOperatingDays: ["Weekdays"],
          },
        ],
      }),
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
      summaryPath: "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.md",
    });

    expect(artifact.summary.routeCount).toBe(2);
    expect(artifact.summary.routeTreatmentRowCount).toBe(
      artifact.summary.routeCount * artifact.summary.checkedTreatmentTypeCount,
    );
    expect(artifact.validation.status).toBe("pass");
    expect(artifact.validation.issues.map((issue) => issue.code)).not.toContain(
      "segment_treatment_rows_not_built",
    );

    expect(
      artifact.routeTreatmentRows.find(
        (row) => row.routeId === "B41" && row.treatmentType === "bus_lane",
      ),
    ).toMatchObject({
      status: "current_confirmed",
      evidenceLabel: "deterministic_source",
      confidence: "medium",
    });
    expect(
      artifact.routeTreatmentRows.find(
        (row) =>
          row.routeId === "B41" && row.treatmentType === "automated_bus_lane_enforcement",
      ),
    ).toMatchObject({
      status: "current_confirmed",
      evidenceLabel: "deterministic_source",
      confidence: "high",
    });
    expect(
      artifact.routeTreatmentRows.find(
        (row) => row.routeId === "Q66" && row.treatmentType === "queue_jump",
      ),
    ).toMatchObject({
      status: "implemented",
      evidenceLabel: "reviewed_document",
      confidence: "high",
    });
    expect(
      artifact.routeTreatmentRows.find(
        (row) => row.routeId === "Q66" && row.treatmentType === "transit_signal_priority",
      ),
    ).toMatchObject({
      status: "source_gap",
      evidenceLabel: "aggregate_source_gap",
    });
    expect(artifact.sourceGapRows).toHaveLength(2);
    expect(artifact.segmentTreatmentRows).toContainEqual(
      expect.objectContaining({
        routeId: "B41",
        treatmentType: "bus_lane",
        status: "current_confirmed",
        evidenceLabel: "deterministic_source",
        confidence: "high",
        matchMethod: "route_shape_overlap",
        overlapShare: 0.72,
      }),
    );
    expect(routeTreatmentSummaryMarkdown(artifact)).toContain("Route Treatment Summary (2026-03)");
  });

  test("projects segment lane overlap checks into positive, negative, and source-gap rows", () => {
    const rows = segmentTreatmentRowsFromLaneOverlaps({
      rows: [
        {
          routeId: "B41",
          month: "2026-03",
          segmentId: "B41:2026-03:N:1:300001:300002",
          directionId: "N",
          segmentOrder: 1,
          laneSource: "dot_bus_lanes_geometry",
          laneOverlapShare: 0.18,
          laneMatchedCount: 1,
          laneTypes: ["Curbside Bus Lane"],
          laneOperatingHours: [],
          laneOperatingDays: [],
        },
        {
          routeId: "B41",
          month: "2026-03",
          segmentId: "B41:2026-03:N:2:300002:300003",
          directionId: "N",
          segmentOrder: 2,
          laneSource: "dot_bus_lanes_geometry",
          laneOverlapShare: 0,
          laneMatchedCount: 0,
          laneTypes: [],
          laneOperatingHours: [],
          laneOperatingDays: [],
        },
        {
          routeId: "B41",
          month: "2026-03",
          segmentId: "B41:2026-03:N:3:300003:300004",
          directionId: "N",
          segmentOrder: 3,
          laneSource: "geometry_unavailable",
          laneOverlapShare: 0,
          laneMatchedCount: 0,
          laneTypes: [],
          laneOperatingHours: [],
          laneOperatingDays: [],
        },
      ],
    });

    expect(rows.map((row) => row.status)).toEqual([
      "current_confirmed",
      "not_found",
      "source_gap",
    ]);
    expect(rows[0]?.confidence).toBe("low");
    expect(rows.map((row) => row.matchMethod)).toEqual([
      "route_shape_overlap",
      "not_matched",
      "source_only",
    ]);
    expect(rows[0]?.sourceRefs).toContain("nyc_dot_bus_lanes_geometry:route_shape_overlap");
    expect(rows[2]?.overlapShare).toBeNull();
  });

  test("loads local DB rows and reports unavailable source tables", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (
          route_id TEXT PRIMARY KEY,
          route_short_name TEXT,
          route_long_name TEXT,
          shape_count INTEGER,
          stop_count INTEGER,
          timepoint_stop_count INTEGER,
          latitude_min REAL,
          latitude_max REAL,
          longitude_min REAL,
          longitude_max REAL
        );
        CREATE TABLE local_ace_route (
          route_id TEXT,
          program TEXT,
          implementation_date TEXT
        );
        CREATE TABLE local_route_brief_summary (
          route_id TEXT,
          month TEXT,
          route_score INTEGER,
          public_visible INTEGER,
          public_visibility_reason TEXT,
          average_speed_mph REAL,
          hotspot_count INTEGER,
          total_ridership REAL,
          total_transfers REAL,
          ace_active INTEGER,
          ace_violation_count INTEGER,
          bus_lane_matched_lane_count INTEGER,
          schedule_match_rate REAL
        );
        CREATE TABLE local_intervention_event (
          event_id TEXT,
          route_id TEXT,
          intervention_type TEXT,
          source_id TEXT,
          program TEXT,
          implementation_date TEXT,
          implementation_month TEXT,
          event_status TEXT,
          description TEXT
        );
        CREATE TABLE local_route_segment_speed (
          route_id TEXT,
          month TEXT,
          row_rank INTEGER,
          timestamp TEXT,
          day_of_week TEXT,
          hour_of_day INTEGER,
          direction TEXT,
          borough TEXT,
          route_type TEXT,
          stop_order INTEGER,
          timepoint_stop_id TEXT,
          timepoint_stop_name TEXT,
          timepoint_stop_latitude REAL,
          timepoint_stop_longitude REAL,
          next_timepoint_stop_id TEXT,
          next_timepoint_stop_name TEXT,
          next_timepoint_stop_latitude REAL,
          next_timepoint_stop_longitude REAL,
          road_distance_miles REAL,
          average_travel_time_minutes REAL,
          average_road_speed_mph REAL,
          bus_trip_count INTEGER
        );

        INSERT INTO local_route_catalog VALUES
          ('B41', 'B41', NULL, 1, 2, 2, NULL, NULL, NULL, NULL);
        INSERT INTO local_ace_route VALUES
          ('B41', 'ACE', '2025-12-01');
        INSERT INTO local_route_brief_summary VALUES
          ('B41', '2026-03', 90, 1, 'visible', 6.5, 3, 1000, 20, 1, 10, 2, 1);
        INSERT INTO local_intervention_event VALUES
          ('evt-1', 'B41', 'select_bus_service', 'manual', 'SBS', '2024-01-01', '2024-01', 'implemented', 'SBS launch');
        INSERT INTO local_route_segment_speed VALUES
          ('B41', '2026-03', 1, '2026-03-01T00:00:00.000', 'Monday', 8, 'N', 'Brooklyn', 'Local', 1, '300001', 'A', 40.1, -73.9, '300002', 'B', 40.2, -73.8, 1.2, 8.3, 8.7, 10),
          ('B41', '2026-03', 2, '2026-03-01T01:00:00.000', 'Monday', 9, 'N', 'Brooklyn', 'Local', 1, '300001', 'A', 40.1, -73.9, '300002', 'B', 40.2, -73.8, 1.2, 8.1, 8.9, 12);
      `);

      const rows = loadRouteTreatmentSummaryLocalDbRows({ sqlite, month: "2026-03" });

      expect(rows.routeRows).toEqual([{ route_id: "B41" }]);
      expect(rows.aceRows).toHaveLength(1);
      expect(rows.routeBriefRows).toHaveLength(1);
      expect(rows.interventionEventRows).toHaveLength(1);
      expect(rows.segmentUniverseRows).toEqual([
        {
          route_id: "B41",
          month: "2026-03",
          direction: "N",
          stop_order: 1,
          timepoint_stop_id: "300001",
          next_timepoint_stop_id: "300002",
        },
      ]);
      expect(rows.missingTables).toEqual([
        "local_tier2_intervention_event",
        "local_tier2_intervention_event_route",
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("canonicalizes current-catalog route aliases and skips unsafe stale routes", () => {
    const artifact = buildRouteTreatmentSummaryArtifact({
      month: "2026-03",
      routeIds: ["Q44+"],
      evidenceRows: routeTreatmentSourceRowsFromPublishableInterventions({
        month: "2026-03",
        rows: [
          {
            recordId: "record-q44",
            sourceId: "tier2-source",
            status: "implemented",
            routes: ["Q44", "Q70"],
            primaryTreatments: ["select_bus_service"],
            effectiveDate: "2015",
            datePrecision: "year",
          },
        ],
      }),
      generatedAt: "2026-06-06T00:00:00.000Z",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
    });

    expect(
      artifact.routeTreatmentRows.find(
        (row) => row.routeId === "Q44+" && row.treatmentType === "select_bus_service",
      ),
    ).toMatchObject({
      status: "implemented",
      sourceRefs: expect.arrayContaining(["publishable_intervention:record-q44"]),
    });
    expect(artifact.routeTreatmentRows.some((row) => row.routeId === "Q70")).toBe(false);
    expect(artifact.validation.issues).toContainEqual(
      expect.objectContaining({
        code: "non_catalog_evidence_route_ids_skipped",
      }),
    );
  });

  test("uses the Studio v2 route treatment-summary namespace", () => {
    expect(routeTreatmentSummaryArtifactPath({ artifactRoot: "data/artifacts", month: "2026-03" })).toBe(
      "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
    );
    expect(routeTreatmentSummaryMarkdownPath({ artifactRoot: "data/artifacts", month: "2026-03" })).toBe(
      "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.md",
    );
  });
});
