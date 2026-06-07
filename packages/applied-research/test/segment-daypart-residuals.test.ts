import { describe, expect, test } from "bun:test";
import { segmentDaypartResidualsArtifactPath } from "../src/artifacts";
import {
  buildSegmentDaypartResidualArtifactV1,
  SEGMENT_DAYPART_PANEL_V1_ID,
} from "../src/feature-resolvers";

describe("segment daypart residuals", () => {
  test("builds expected-speed residuals within segment dayparts", () => {
    const artifact = buildSegmentDaypartResidualArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      artifactPath: "segment-daypart-residuals.json",
      spec: {
        panelId: SEGMENT_DAYPART_PANEL_V1_ID,
        startMonth: "2026-01",
        endMonth: "2026-03",
        minObservationCount: 2,
      },
      rows: [
        {
          route_id: "M1",
          month: "2026-01",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 10,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-01",
          segment_id: "M1:N:2:b:c",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 12,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-02",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 10,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-02",
          segment_id: "M1:N:2:b:c",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 12,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 8,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:N:2:b:c",
          direction: "N",
          daypart: "am_peak",
          observation_count: 5,
          traversal_count: 100,
          average_speed_mph: 12,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
        {
          route_id: "M1",
          month: "2026-03",
          segment_id: "M1:N:1:a:b",
          direction: "N",
          daypart: "midday",
          observation_count: 1,
          traversal_count: 100,
          average_speed_mph: 20,
          average_travel_time_minutes: 5,
          average_road_distance_miles: 0.5,
        },
      ],
    });

    expect(artifact.summary).toMatchObject({
      panelRowCount: 6,
      modeledReleaseRowCount: 2,
      routeCount: 1,
      segmentCount: 2,
      daypartCount: 1,
    });
    expect(artifact.panelManifest).toMatchObject({
      panelId: "segment_daypart_panel_v1",
      generatedAt: "2026-06-07T00:00:00.000Z",
      summary: {
        sourceRowCount: 7,
        supportedRowCount: 6,
        panelRowCount: 6,
        routeCount: 1,
        entityCount: 2,
        monthCount: 3,
      },
    });
    const marchSlowSegment = artifact.rows.find((row) => row.segmentId === "M1:N:1:a:b");
    expect(marchSlowSegment?.expectedSpeedMph).toBeCloseTo(8.6667, 4);
    expect(marchSlowSegment?.speedResidualMph).toBeCloseTo(-0.6667, 4);
    expect(marchSlowSegment?.residualRankWithinMonthDaypart).toBe(1);
    expect(marchSlowSegment?.daypart).toBe("am_peak");
  });

  test("owns the segment daypart residual artifact path", () => {
    expect(
      segmentDaypartResidualsArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/segment-daypart-residuals-v1/2023-04_to_2026-03/2026-03/segment-daypart-residuals.json",
    );
  });
});
