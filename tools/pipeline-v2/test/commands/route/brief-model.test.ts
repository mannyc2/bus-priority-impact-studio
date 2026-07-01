import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/brief-model.ts");
const implementationPath = join(import.meta.dir, "../../../src/effect/route-brief-model.ts");
const metricsPath = join(import.meta.dir, "../../../src/lib/route-briefs/metrics.ts");

describe("route brief-model command boundary", () => {
  test("runs route brief-model through the Effect service boundary", async () => {
    const source = await readFile(commandPath, "utf8");

    expect(source).toContain('from "../../effect/route-brief-model.ts"');
    expect(source).toContain('from "../../effect/runtime.ts"');
    expect(source).toContain("runPipelineEffect(");
    expect(source).toContain("runRouteBriefModelCommand({");
    expect(source).toContain("makeRouteBriefModelCommandLayer({");
    expect(source).not.toContain("withLocalDb(");
    expect(source).not.toContain("localDbFromCtx(");
  });

  test("delegates route brief model construction to the pipeline lib", async () => {
    const source = await readFile(implementationPath, "utf8");

    expect(source).toContain('from "../lib/route-briefs/index.ts"');
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

  test("keeps route brief metrics in the pipeline lib", () => {
    expect(existsSync(metricsPath)).toBe(true);
  });
});
