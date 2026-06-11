import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/brief-model.ts");
const metricsPath = join(import.meta.dir, "../../../src/commands/route/brief-metrics.ts");

describe("route brief-model command boundary", () => {
  test("delegates analytics model construction to applied-research", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/route-briefs"');
    expect(source).toContain("buildRouteBriefModel({");
    expect(source).toContain("buildRouteBriefHotspotProjection({");
    expect(source).toContain("planRouteBriefModelRoutes({");
    expect(source).toContain("routeBriefModelServingProjection(model)");
    expect(source).toContain("routeBriefComparisonRankRows(");

    expect(source).not.toContain('from "@bp/analytics"');
    expect(source).not.toContain('from "@bp/analytics/');
    expect(source).not.toContain("function buildRouteBriefModel");
    expect(source).not.toContain("function buildRouteBriefSegmentUniverse");
    expect(source).not.toContain("function buildRouteBriefHotspotProjection");
    expect(source).not.toContain("function planRouteBriefModelRoutes");
    expect(source).not.toContain("function routeBriefComparisonRankRows");
    expect(source).not.toContain("routeBriefVisibilityReason");
    expect(source).not.toContain("skippedUnknownRoutes");
    expect(source).not.toContain("requestedRouteIds");
    expect(source).not.toContain("route_not_in_catalog");
    expect(source).not.toContain("publicVisibilityReason: visibility");
    expect(source).not.toContain("detectSegmentHotspots");
    expect(source).not.toContain("calculateRouteScore");
    expect(source).not.toContain("classifyPublicRouteVisibility");
  });

  test("does not keep a duplicate route brief metrics implementation in pipeline", () => {
    expect(existsSync(metricsPath)).toBe(false);
  });
});
