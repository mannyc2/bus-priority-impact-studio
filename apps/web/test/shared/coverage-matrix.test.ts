import { describe, expect, test } from "bun:test";
import {
  checkedCleanCoverageChips,
  coverageLatestDataAsOf,
  coverageLatestSurfaceDataAsOf,
  coverageRows,
  coverageSummary,
} from "../../src/components/route/coverage-matrix";
import type { RouteSurfaceCapability, StudioRouteCapability } from "../../src/studio/api-contract";

function surface(
  state: RouteSurfaceCapability["state"],
  depth: RouteSurfaceCapability["depth"] = null,
): RouteSurfaceCapability {
  return {
    state,
    reason: state === "ready" ? null : `because ${state}`,
    depth,
    dataAsOf: state === "not_applicable" ? null : "2026-03",
    freshness: "current",
  };
}

function capability(surfaces: Record<string, RouteSurfaceCapability>): StudioRouteCapability {
  return { overallState: "ready", surfaces, caveats: [] };
}

describe("coverage matrix", () => {
  test("turns manifest surfaces into ordered public evidence rows", () => {
    const rows = coverageRows(
      capability({
        reliability: surface("checked_clean", { monthsCovered: 3, grains: ["stop_hour"] }),
        treatment: surface("blocked"),
        speedHistory: surface("ready", { monthsCovered: 36, grains: ["route_month"] }),
        customSignal: surface("insufficient_data"),
      }),
    );

    expect(rows.map((row) => [row.label, row.stateLabel, row.depthLabel])).toEqual([
      ["Speed history", "Ready", "36 months / route_month"],
      ["Reliability", "Checked clean", "3 months / stop_hour"],
      ["Custom Signal", "Insufficient data", "depth unknown"],
      ["Treatments", "Blocked", "depth unknown"],
    ]);
    expect(coverageSummary(rows)).toBe("1 ready / 1 checked clean / 1 insufficient / 1 blocked");
    expect(checkedCleanCoverageChips(rows)).toEqual([
      {
        key: "reliability",
        label: "Reliability",
        checkedThroughLabel: "through 2026-03",
        dataAsOf: "2026-03",
        depthLabel: "3 months / stop_hour",
        reason: "because checked_clean",
      },
    ]);
    expect(coverageLatestDataAsOf(rows)).toBe("2026-03");
  });

  test("handles missing legacy capability without inventing coverage", () => {
    expect(coverageRows(null)).toEqual([]);
    expect(coverageSummary([])).toBe("No manifest surfaces");
    expect(checkedCleanCoverageChips([])).toEqual([]);
    expect(coverageLatestDataAsOf([])).toBeNull();
  });

  test("uses the latest manifest surface month for route-level freshness", () => {
    const rows = coverageRows(
      capability({
        trend: { ...surface("ready"), dataAsOf: "2026-01" },
        reliability: { ...surface("building"), dataAsOf: "2026-04" },
        treatment: surface("not_applicable"),
      }),
    );

    expect(coverageLatestDataAsOf(rows)).toBe("2026-04");
  });

  test("uses named manifest surfaces for section freshness fallbacks", () => {
    const manifest = capability({
      condition: { ...surface("ready"), dataAsOf: "2026-01" },
      trend: { ...surface("ready"), dataAsOf: "2026-02" },
      speedHistory: { ...surface("ready"), dataAsOf: "2026-04" },
      treatment: { ...surface("partial"), dataAsOf: "2026-03" },
    });

    expect(coverageLatestSurfaceDataAsOf(manifest, ["trend", "speedHistory"])).toBe("2026-04");
    expect(coverageLatestSurfaceDataAsOf(manifest, ["treatment"])).toBe("2026-03");
    expect(coverageLatestSurfaceDataAsOf(manifest, ["reliability"])).toBeNull();
    expect(coverageLatestSurfaceDataAsOf(null, ["condition"])).toBeNull();
  });
});
