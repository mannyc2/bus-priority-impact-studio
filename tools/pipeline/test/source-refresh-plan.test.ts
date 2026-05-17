import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { buildSourceRefreshPlan } from "../src/jobs/check/source-refresh-plan.js";
import { fromRepoRoot } from "../src/source-manifest.js";

const workingRoot = fromRepoRoot(join("data/working/test-source-refresh-plan"));
const artifactRoot = join(workingRoot, "artifacts");

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("source refresh plan", () => {
  test("marks monthly watcher ready when a new complete speed month exists", async () => {
    const plan = await buildSourceRefreshPlan({
      startYear: 2026,
      endYear: 2026,
      year: 2026,
      month: 3,
      lastBuiltYear: 2026,
      lastBuiltMonth: 2,
      minSpeedRoutes: 2,
      artifactRoot,
      fetcher: async () =>
        Response.json([
          {
            year: "2026",
            month: "3",
            route_id: "M1",
            row_count: "20",
            bus_trip_count: "200",
          },
          {
            year: "2026",
            month: "3",
            route_id: "M2",
            row_count: "10",
            bus_trip_count: "150",
          },
        ]),
    });

    expect(plan.requestedMonth).toBe("2026-03");
    expect(plan.lastBuiltMonth).toBe("2026-02");
    expect(plan.routeSpeedAvailability.releaseDecision.shouldRebuild).toBe(true);
    expect(plan.jobs.find((job) => job.id === "gtfs_rt_collector")).toEqual(
      expect.objectContaining({
        requiredForV1: true,
        status: "required",
      }),
    );
    expect(plan.jobs.find((job) => job.id === "route_speed_monthly_watcher")).toEqual(
      expect.objectContaining({
        requiredForV1: true,
        status: "ready_to_rebuild",
      }),
    );
    expect(plan.jobs.find((job) => job.id === "route_speed_monthly_watcher")?.evidence).toContain(
      "shouldRebuild=true",
    );
    expect(plan.artifactPath).toBe(join(artifactRoot, "source-refresh", "plan.json"));
    await expect(Bun.file(plan.artifactPath).json()).resolves.toEqual(plan);
  });

  test("keeps monthly watcher idle when the latest complete speed month is already built", async () => {
    const plan = await buildSourceRefreshPlan({
      startYear: 2026,
      endYear: 2026,
      year: 2026,
      month: 4,
      lastBuiltYear: 2026,
      lastBuiltMonth: 3,
      minSpeedRoutes: 1,
      artifactRoot,
      fetcher: async () =>
        Response.json([
          {
            year: "2026",
            month: "3",
            route_id: "M1",
            row_count: "20",
            bus_trip_count: "200",
          },
        ]),
    });

    expect(plan.routeSpeedAvailability.requestedMonth).toEqual(
      expect.objectContaining({
        isoMonth: "2026-04",
        status: "missing_speed",
      }),
    );
    expect(plan.routeSpeedAvailability.releaseDecision.shouldRebuild).toBe(false);
    expect(plan.jobs.find((job) => job.id === "route_speed_monthly_watcher")).toEqual(
      expect.objectContaining({
        status: "idle",
      }),
    );
    expect(
      plan.jobs.find((job) => job.id === "route_speed_monthly_watcher")?.nextActions,
    ).toContain("Poll again on the next scheduled watcher interval.");
  });
});
