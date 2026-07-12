import { describe, expect, test } from "bun:test";
import {
  type NormalizedStudioRouteIndexSourceRow,
  routeProjectionRefs,
} from "../src/studio/route-index-read-model.ts";

function projectionStatus(
  spineReadiness: "series_ready" | "series_ready_with_gaps" | "needs_pattern_review" | "failed",
  missingCellCount = 0,
) {
  const row = {
    routeId: "B41",
    historyCoverage: {
      pointCount: 0,
      startMonth: null,
      endMonth: null,
    },
    speedHistoryCoverage: {
      routeSlug: "b41",
      startMonth: "2023-04",
      endMonth: "2026-03",
      spineReadiness,
      missingCellCount,
    },
    summary: null,
    artifactNames: [],
  } as unknown as NormalizedStudioRouteIndexSourceRow;
  return routeProjectionRefs({ row, lastBuiltSpeedMonth: undefined }).find(
    (ref) => ref.id === "route_speed_history",
  )?.status;
}

describe("route speed-history spine readiness", () => {
  test("only advertises complete series-ready history as available", () => {
    expect(projectionStatus("series_ready")).toBe("available");
    expect(projectionStatus("series_ready", 1)).toBe("partial");
    expect(projectionStatus("series_ready_with_gaps")).toBe("partial");
    expect(projectionStatus("needs_pattern_review")).toBe("partial");
    expect(projectionStatus("failed")).toBe("downstream_blocked");
  });
});
