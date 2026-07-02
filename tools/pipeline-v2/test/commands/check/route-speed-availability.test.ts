import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRouteSpeedAvailability } from "../../../src/commands/check/route-speed-availability.ts";
import { fromRepoRoot } from "../../../src/lib/paths.ts";

const manifestYaml = `verified_at: 2026-01-01
sources:
  - id: bus_segment_speeds_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: kufs-yh3x
    url: https://data.ny.gov/x
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
    purpose: test
    status: active
`;

function fakeFetcher(rows: readonly unknown[]) {
  return async (_input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const limit = Number(body.page?.pageSize ?? 5000);
    const offset = (Number(body.page?.pageNumber ?? 1) - 1) * limit;
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
      headers: { "content-type": "application/json" },
    });
  };
}

let tmp: string | undefined;
afterEach(async () => {
  if (tmp !== undefined) {
    await rm(tmp, { force: true, recursive: true });
    tmp = undefined;
  }
});

describe("runRouteSpeedAvailability", () => {
  it("keeps path policy and availability classification in analytics", () => {
    const source = readFileSync(
      fromRepoRoot("tools/pipeline-v2/src/commands/check/route-speed-availability.ts"),
      "utf8",
    );

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/analytics/evaluation"');
    expect(source).not.toContain("function summarizeSpeedMonths");
    expect(source).not.toContain("function requestedStatus");
    expect(source).not.toContain("function releaseDecision");
    expect(source).not.toContain("const RawRowSchema");
  });

  it("marks the most recent complete month and recommends a rebuild when newer than lastBuilt", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-rsa-"));
    // Two months: 2026-03 with 3 routes (complete) and 2026-02 with 2 routes (complete).
    const rows = [
      { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
      { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
      { year: 2026, month: 3, route_id: "Q70", row_count: 60, bus_trip_count: 6 },
      { year: 2026, month: 2, route_id: "B41", row_count: 90, bus_trip_count: 9 },
      { year: 2026, month: 2, route_id: "M14A", row_count: 70, bus_trip_count: 7 },
    ];

    const result = await runRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      lastBuiltYear: 2026,
      lastBuiltMonth: 2,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });

    expect(result.latestSpeedMonth?.isoMonth).toBe("2026-03");
    expect(result.latestSpeedMonth?.routeCount).toBe(3);
    expect(result.months.map((m) => m.isoMonth)).toEqual(["2026-03", "2026-02"]);
    expect(result.releaseDecision.status).toBe("new_complete_month_available");
    expect(result.releaseDecision.shouldRebuild).toBe(true);
    expect(result.releaseDecision.latestCompleteMonth).toBe("2026-03");
    expect(result.releaseDecision.lastBuiltMonth).toBe("2026-02");
    expect(await Bun.file(result.artifactPath).exists()).toBe(true);
  });

  it("reports no rebuild when lastBuilt is at or beyond latest complete month", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-rsa-"));
    const rows = [
      { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
      { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
    ];
    const result = await runRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      lastBuiltYear: 2026,
      lastBuiltMonth: 3,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });
    expect(result.releaseDecision.status).toBe("no_new_complete_month");
    expect(result.releaseDecision.shouldRebuild).toBe(false);
  });

  it("reports no_complete_speed_month when nothing meets minSpeedRoutes", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-rsa-"));
    const rows = [{ year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 }];
    const result = await runRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });
    expect(result.latestSpeedMonth).toBeNull();
    expect(result.releaseDecision.status).toBe("no_complete_speed_month");
    expect(result.releaseDecision.shouldRebuild).toBe(false);
  });

  it("populates requestedMonth=missing_speed when the requested month has no rows", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-rsa-"));
    const rows = [
      { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
      { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
    ];
    const result = await runRouteSpeedAvailability({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      year: 2026,
      month: 4,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });
    expect(result.requestedMonth?.isoMonth).toBe("2026-04");
    expect(result.requestedMonth?.status).toBe("missing_speed");
  });

  it("rejects mismatched year/month pair", async () => {
    await expect(
      runRouteSpeedAvailability({
        year: 2026,
        fetcher: fakeFetcher([]),
        manifestText: manifestYaml,
      }),
    ).rejects.toThrow(/year and month must be provided together/i);
  });
});
