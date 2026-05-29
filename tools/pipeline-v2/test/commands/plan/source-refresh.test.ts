import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSourceRefreshPlan } from "../../../src/commands/plan/source-refresh.ts";

const manifestYaml = `verified_at: 2026-01-01
sources:
  - id: bus_segment_speeds_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: kufs-yh3x
    url: https://data.ny.gov/x
    api_json: https://data.ny.gov/resource/kufs-yh3x.json
    columns_json: https://data.ny.gov/api/views/kufs-yh3x/columns.json
    rows_csv: https://data.ny.gov/api/views/kufs-yh3x/rows.csv
    purpose: test
    status: active
`;

function fakeFetcher(rows: readonly unknown[]) {
  return async (input: string | URL) => {
    const url = new URL(input);
    const offset = Number(url.searchParams.get("$offset") ?? "0");
    const limit = Number(url.searchParams.get("$limit") ?? "5000");
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

describe("runSourceRefreshPlan", () => {
  it("emits a ready_to_rebuild watcher job when speed data is newer than lastBuilt", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-srp-"));
    const rows = [
      { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
      { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
    ];
    const plan = await runSourceRefreshPlan({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      lastBuiltYear: 2026,
      lastBuiltMonth: 2,
      gtfsRtSampleSeconds: 30,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });

    expect(plan.lastBuiltMonth).toBe("2026-02");
    expect(plan.routeSpeedAvailability.releaseDecision.shouldRebuild).toBe(true);
    const watcher = plan.jobs.find((j) => j.id === "route_speed_monthly_watcher");
    expect(watcher?.status).toBe("ready_to_rebuild");
    expect(watcher?.nextActions[0]).toMatch(/Run ingest\/build\/finalize for 2026-03/);

    const collector = plan.jobs.find((j) => j.id === "gtfs_rt_collector");
    expect(collector?.status).toBe("required");
    expect(collector?.cadence).toContain("every 30s");

    expect(await Bun.file(plan.artifactPath).exists()).toBe(true);
  });

  it("emits an idle watcher job when there is no newer complete month than lastBuilt", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-srp-"));
    const rows = [
      { year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 },
      { year: 2026, month: 3, route_id: "M14A", row_count: 80, bus_trip_count: 8 },
    ];
    const plan = await runSourceRefreshPlan({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      lastBuiltYear: 2026,
      lastBuiltMonth: 3,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });
    const watcher = plan.jobs.find((j) => j.id === "route_speed_monthly_watcher");
    expect(watcher?.status).toBe("idle");
  });

  it("emits a blocked watcher job when no month meets minSpeedRoutes", async () => {
    tmp = await mkdtemp(join(tmpdir(), "bp-v2-srp-"));
    const rows = [{ year: 2026, month: 3, route_id: "B41", row_count: 100, bus_trip_count: 10 }];
    const plan = await runSourceRefreshPlan({
      startYear: 2026,
      endYear: 2026,
      minSpeedRoutes: 2,
      artifactRoot: tmp,
      fetcher: fakeFetcher(rows),
      manifestText: manifestYaml,
    });
    const watcher = plan.jobs.find((j) => j.id === "route_speed_monthly_watcher");
    expect(watcher?.status).toBe("blocked");
  });
});
