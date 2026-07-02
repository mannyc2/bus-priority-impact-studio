import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/route-hourly-profile.ts");

describe("build route-hourly-profile command boundary", () => {
  test("keeps path policy and feature artifact construction in analytics", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/feature-history"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("loadRouteHourlyProfileLocalDbRows({");
    expect(source).toContain("buildRouteHourlyProfileArtifact({");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new BunDatabase");
    expect(source).not.toContain("local_route_hourly_ridership");
    expect(source).not.toContain("ROW_NUMBER()");
    expect(source).not.toContain("route_month_compact_hourly_profile");
  });
});
