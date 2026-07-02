import { describe, expect, test } from "bun:test";
import {
  expressBusCapacityContextPath,
  expressRouteAnalysisAuditPath,
  expressRouteAnalysisPath,
  stopDirectionHourEwtFeatureArtifactPath,
} from "@bp/analytics/artifacts";

describe("analytics artifact paths", () => {
  test("owns express capacity and route analysis artifact paths", () => {
    expect(expressBusCapacityContextPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-bus-capacity/route-hour-summary-2023-04-2023-09.json",
    );
    expect(expressRouteAnalysisPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-route-analysis/load-speed-context-2023-04-2023-09.json",
    );
    expect(expressRouteAnalysisAuditPath({ artifactRoot: "data/artifacts" })).toBe(
      "data/artifacts/express-route-analysis/audit-2023-04-2023-09.json",
    );
  });

  test("owns stop-direction-hour EWT feature artifact paths", () => {
    expect(
      stopDirectionHourEwtFeatureArtifactPath({
        artifactRoot: "data/artifacts",
        month: "2026-03",
        runId: "bus-observatory-2026-03",
        routeId: "M15+",
      }),
    ).toBe(
      "data/artifacts/analytics-stop-direction-hour-ewt/2026-03/bus-observatory-2026-03/m15+/stop-direction-hour-ewt-features.json",
    );
  });
});
