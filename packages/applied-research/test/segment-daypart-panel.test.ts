import { describe, expect, test } from "bun:test";
import { segmentDaypartPanelArtifactPath } from "../src/artifacts";
import { buildSegmentDaypartPanelArtifact } from "../src/feature-history";
import { SEGMENT_DAYPART_PANEL_V1_ID } from "../src/feature-resolvers";

describe("segment daypart panel", () => {
  test("builds a full-history research panel with eligibility counts", () => {
    const artifact = buildSegmentDaypartPanelArtifact({
      generatedAt: "2026-06-11T00:00:00.000Z",
      releaseMonth: "2026-03",
      dbPath: "data/local/pipeline.sqlite",
      artifactPath: "segment-daypart-panel.json",
      spec: {
        panelId: SEGMENT_DAYPART_PANEL_V1_ID,
        startMonth: "2026-01",
        endMonth: "2026-03",
        minObservationCount: 10,
      },
      rows: [
        {
          route_id: "M1",
          month: "2026-01",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "am_peak",
          observation_count: 12,
          traversal_count: 100,
          average_speed_mph: 10,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-02",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "am_peak",
          observation_count: 9,
          traversal_count: 100,
          average_speed_mph: 11,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:N:2:b:c",
          direction: "N",
          daypart: "midday",
          observation_count: 20,
          traversal_count: 0,
          average_speed_mph: 12,
          average_travel_time_minutes: 4,
          average_road_distance_miles: 0.6,
        },
        {
          route_id: "M2",
          month: "2026-03",
          segment_id: "M2:S:1:x:y",
          direction: "S",
          daypart: "pm_peak",
          observation_count: 15,
          traversal_count: 80,
          average_speed_mph: null,
          average_travel_time_minutes: null,
          average_road_distance_miles: 0.4,
        },
        {
          route_id: "M1",
          month: "2025-12",
          segment_id: "M1:N:0:z:a",
          direction: "N",
          daypart: "am_peak",
          observation_count: 12,
          traversal_count: 100,
          average_speed_mph: 9,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
      ],
    });

    expect(artifact).toMatchObject({
      artifactKind: "applied_research_segment_daypart_panel",
      releaseMonth: "2026-03",
      summary: {
        panelRowCount: 4,
        eligiblePanelRowCount: 1,
        releaseMonthRowCount: 2,
        routeCount: 2,
        segmentCount: 3,
        daypartCount: 3,
      },
    });
    expect(artifact.panelManifest.summary).toMatchObject({
      sourceRowCount: 4,
      supportedRowCount: 1,
      panelRowCount: 4,
      routeCount: 2,
      entityCount: 3,
      monthCount: 3,
    });
    expect(artifact.rows.map((row) => row.eligibilityStatus)).toEqual([
      "eligible",
      "low_observation_count",
      "zero_traversal_count",
      "missing_speed",
    ]);
  });

  test("owns the applied-research segment daypart panel artifact path", () => {
    expect(
      segmentDaypartPanelArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        releaseMonth: "2026-03",
      }),
    ).toBe("data/artifacts/applied-research/2023-04_to_2026-03/2026-03/segment-daypart-panel.json");
  });
});
