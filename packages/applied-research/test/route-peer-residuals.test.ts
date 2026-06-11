import { describe, expect, test } from "bun:test";
import { routePeerResidualsArtifactPath } from "../src/artifacts";
import {
  buildRoutePeerResidualArtifactV1,
  ROUTE_MONTH_PEER_PANEL_V1_ID,
} from "../src/feature-resolvers";

describe("route peer residuals", () => {
  test("builds route residuals from own history plus network month movement", () => {
    const artifact = buildRoutePeerResidualArtifactV1({
      generatedAt: "2026-06-07T00:00:00.000Z",
      releaseMonth: "2026-03",
      artifactPath: "route-peer-residuals.json",
      spec: {
        panelId: ROUTE_MONTH_PEER_PANEL_V1_ID,
        startMonth: "2026-01",
        endMonth: "2026-03",
        minObservationCount: 10,
        minHistoryMonths: 2,
      },
      rows: [
        { route_id: "M1", month: "2026-01", average_speed_mph: 10, speed_observation_count: 20 },
        { route_id: "M2", month: "2026-01", average_speed_mph: 12, speed_observation_count: 20 },
        { route_id: "M1", month: "2026-02", average_speed_mph: 10, speed_observation_count: 20 },
        { route_id: "M2", month: "2026-02", average_speed_mph: 12, speed_observation_count: 20 },
        { route_id: "M1", month: "2026-03", average_speed_mph: 8, speed_observation_count: 20 },
        { route_id: "M2", month: "2026-03", average_speed_mph: 12, speed_observation_count: 20 },
        { route_id: "M3", month: "2026-03", average_speed_mph: 20, speed_observation_count: 2 },
      ],
    });

    expect(artifact.summary).toMatchObject({
      panelRowCount: 6,
      modeledReleaseRowCount: 2,
      routeCount: 2,
    });
    expect(artifact.panelManifest).toMatchObject({
      panelId: "route_month_peer_panel_v1",
      summary: {
        sourceRowCount: 7,
        supportedRowCount: 6,
        panelRowCount: 6,
        routeCount: 2,
        entityCount: 2,
        monthCount: 3,
      },
    });
    const m1 = artifact.rows.find((row) => row.routeId === "M1");
    expect(m1?.expectedSpeedMph).toBeCloseTo(8.6667, 4);
    expect(m1?.speedResidualMph).toBeCloseTo(-0.6667, 4);
    expect(m1?.residualRankWithinMonth).toBe(1);
    expect(m1?.residualRouteCount).toBe(2);
  });

  test("owns the route peer residual artifact path", () => {
    expect(
      routePeerResidualsArtifactPath({
        artifactRoot: "data/artifacts",
        startMonth: "2023-04",
        endMonth: "2026-03",
        releaseMonth: "2026-03",
      }),
    ).toBe(
      "data/artifacts/analytics-models/route-peer-residuals-v1/2023-04_to_2026-03/2026-03/route-peer-residuals.json",
    );
  });
});
