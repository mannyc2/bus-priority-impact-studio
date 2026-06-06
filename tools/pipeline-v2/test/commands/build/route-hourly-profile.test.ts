import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/route-hourly-profile.ts");

describe("build route-hourly-profile command boundary", () => {
  test("keeps local ridership SQL and profile artifact construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/feature-history"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("loadRouteHourlyProfileLocalDbRows({");
    expect(source).toContain("buildRouteHourlyProfileArtifact({");
    expect(source).not.toContain("local_route_hourly_ridership");
    expect(source).not.toContain("ROW_NUMBER()");
    expect(source).not.toContain("route_month_compact_hourly_profile");
  });
});
