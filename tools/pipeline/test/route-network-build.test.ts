import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteNetwork } from "../src/jobs/build/route-network-build.js";
import { fromRepoRoot } from "../src/source-manifest.js";

type PersistArgs = {
  status: string;
  builtRouteIds: string[];
  failedRoutes: { routeId: string; error: string }[];
};

describe("route network build", () => {
  const reportDir = fromRepoRoot(join("data/artifacts/network-builds", "2026-08"));

  afterEach(async () => {
    await rm(reportDir, { recursive: true, force: true });
  });

  test("builds all eligible routes, records failures, and still finalizes successful routes", async () => {
    const calls: string[] = [];
    const reports: unknown[] = [];
    const result = await buildRouteNetwork(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
      },
      {
        buildRouteReadiness: async () => {
          calls.push("readiness");
          return {
            isoMonth: "2026-08",
            routeCount: 3,
            buildEligibleRouteCount: 3,
            dbPath: "/tmp/pipeline.sqlite",
          };
        },
        buildRouteBuildPlan: async () => {
          calls.push("plan");
          return {
            isoMonth: "2026-08",
            routeCount: 3,
            selectedRouteCount: 3,
            alreadyBuiltRouteCount: 0,
            blockedRouteCount: 0,
            backlogRouteCount: 0,
            dbPath: "/tmp/pipeline.sqlite",
          };
        },
        listBuildEligibleRoutes: async () => {
          calls.push("eligible");
          return ["T1", "T2", "T3"];
        },
        listPersistedProgress: async () => {
          calls.push("progress");
          return {
            status: null,
            builtRouteIds: [],
            failedRoutes: [],
          };
        },
        ingestAceRoutes: async () => {
          calls.push("shared:ace-routes");
          return {};
        },
        ingestAceViolationSummary: async () => {
          calls.push("shared:ace-violations");
          return {};
        },
        ingestBusLanes: async () => {
          calls.push("shared:bus-lanes");
          return {};
        },
        buildRouteSliceArtifacts: async ({ routeId }: { routeId?: string }) => {
          calls.push(`build:${routeId}`);
          if (routeId === "T2") {
            throw new Error("fixture build failure");
          }

          return {
            routeId: routeId ?? "",
            isoMonth: "2026-08",
            segmentSpeedRows: 20,
            ridershipWindows: 4,
            scheduleTimepoints: 12,
            hotspotCount: 2,
            routeScore: routeId === "T1" ? 40 : 45,
            artifactCount: 9,
          };
        },
        runRoutePostBuild: async ({ routeCount }: { routeCount?: number }) => {
          calls.push(`post-build:${routeCount}`);
          return {
            d1SeedPath: "/tmp/seed.sql",
            refreshedPlanDbPath: "/tmp/pipeline.sqlite",
          };
        },
        writeReport: async (summary: unknown) => {
          reports.push(summary);
          return "/tmp/network-summary.json";
        },
        persistBatchProgress: async ({ status, builtRouteIds, failedRoutes }: PersistArgs) => {
          calls.push(`persist:${status}:${builtRouteIds.length}:${failedRoutes.length}`);
        },
      } as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "completed",
        isoMonth: "2026-08",
        requestedRouteCount: 3,
        skippedBuiltRouteCount: 0,
        builtRouteCount: 2,
        failedRouteCount: 1,
        remainingRouteCount: 0,
        resumedRouteIds: [],
        builtRouteIds: ["T1", "T3"],
        d1SeedPath: "/tmp/seed.sql",
        refreshedPlanDbPath: "/tmp/pipeline.sqlite",
        reportPath: "/tmp/network-summary.json",
      }),
    );
    expect(result.failedRoutes).toEqual([{ routeId: "T2", error: "fixture build failure" }]);
    expect(result.routes.map((route) => route.routeId)).toEqual(["T1", "T3"]);
    expect(calls).toEqual([
      "readiness",
      "plan",
      "eligible",
      "progress",
      "persist:running:0:0",
      "shared:ace-routes",
      "shared:ace-violations",
      "shared:bus-lanes",
      "build:T1",
      "persist:running:1:0",
      "build:T2",
      "persist:running:1:1",
      "build:T3",
      "persist:running:2:1",
      "post-build:2",
      "persist:fail:2:1",
    ]);
    expect(reports).toHaveLength(5);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        status: "running",
        attemptedRouteCount: 0,
        remainingRouteCount: 3,
      }),
    );
    expect(reports[2]).toEqual(
      expect.objectContaining({
        status: "running",
        attemptedRouteCount: 2,
        builtRouteCount: 1,
        failedRouteCount: 1,
        failedRoutes: [{ routeId: "T2", error: "fixture build failure" }],
      }),
    );
    expect(reports[4]).toEqual(
      expect.objectContaining({
        status: "completed",
        builtRouteCount: 2,
        failedRouteCount: 1,
        builtRouteIds: ["T1", "T3"],
      }),
    );
  });

  test("skips shared refresh and post-build when no eligible routes are available", async () => {
    const calls: string[] = [];
    const reports: unknown[] = [];
    const result = await buildRouteNetwork(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
      },
      {
        buildRouteReadiness: async () => {
          calls.push("readiness");
          return {
            isoMonth: "2026-08",
            routeCount: 0,
            buildEligibleRouteCount: 0,
            dbPath: "/tmp/pipeline.sqlite",
          };
        },
        buildRouteBuildPlan: async () => {
          calls.push("plan");
          return {
            isoMonth: "2026-08",
            routeCount: 0,
            selectedRouteCount: 0,
            alreadyBuiltRouteCount: 0,
            blockedRouteCount: 0,
            backlogRouteCount: 0,
            dbPath: "/tmp/pipeline.sqlite",
          };
        },
        listBuildEligibleRoutes: async () => {
          calls.push("eligible");
          return [];
        },
        listPersistedProgress: async () => {
          calls.push("progress");
          return {
            status: null,
            builtRouteIds: [],
            failedRoutes: [],
          };
        },
        ingestAceRoutes: async () => {
          calls.push("shared:ace-routes");
          return {};
        },
        ingestAceViolationSummary: async () => {
          calls.push("shared:ace-violations");
          return {};
        },
        ingestBusLanes: async () => {
          calls.push("shared:bus-lanes");
          return {};
        },
        buildRouteSliceArtifacts: async () => {
          calls.push("build");
          throw new Error("should not build");
        },
        runRoutePostBuild: async () => {
          calls.push("post-build");
          return {
            d1SeedPath: "/tmp/seed.sql",
            refreshedPlanDbPath: "/tmp/pipeline.sqlite",
          };
        },
        writeReport: async (summary: unknown) => {
          reports.push(summary);
          return "/tmp/network-summary.json";
        },
        persistBatchProgress: async ({ status, builtRouteIds, failedRoutes }: PersistArgs) => {
          calls.push(`persist:${status}:${builtRouteIds.length}:${failedRoutes.length}`);
        },
      } as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "completed",
        requestedRouteCount: 0,
        skippedBuiltRouteCount: 0,
        builtRouteCount: 0,
        failedRouteCount: 0,
        remainingRouteCount: 0,
        d1SeedPath: null,
        refreshedPlanDbPath: null,
      }),
    );
    expect(calls).toEqual([
      "readiness",
      "plan",
      "eligible",
      "progress",
      "persist:running:0:0",
      "persist:pass:0:0",
    ]);
    expect(reports).toHaveLength(2);
  });

  test("resumes by skipping already-built routes", async () => {
    const calls: string[] = [];
    const reports: unknown[] = [];
    const result = await buildRouteNetwork(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
      },
      {
        buildRouteReadiness: async () => ({
          isoMonth: "2026-08",
          routeCount: 3,
          buildEligibleRouteCount: 3,
          dbPath: "/tmp/pipeline.sqlite",
        }),
        buildRouteBuildPlan: async () => ({
          isoMonth: "2026-08",
          routeCount: 3,
          selectedRouteCount: 3,
          alreadyBuiltRouteCount: 1,
          blockedRouteCount: 0,
          backlogRouteCount: 0,
          dbPath: "/tmp/pipeline.sqlite",
        }),
        listBuildEligibleRoutes: async () => ["T1", "T2", "T3"],
        listPersistedProgress: async () => ({
          status: "running",
          builtRouteIds: ["T1"],
          failedRoutes: [{ routeId: "T3", error: "earlier failure" }],
        }),
        ingestAceRoutes: async () => ({}),
        ingestAceViolationSummary: async () => ({}),
        ingestBusLanes: async () => ({}),
        buildRouteSliceArtifacts: async ({ routeId }: { routeId?: string }) => {
          calls.push(`build:${routeId}`);
          return {
            routeId: routeId ?? "",
            isoMonth: "2026-08",
            segmentSpeedRows: 20,
            ridershipWindows: 4,
            scheduleTimepoints: 12,
            hotspotCount: 2,
            routeScore: 45,
            artifactCount: 9,
          };
        },
        runRoutePostBuild: async ({ routeCount }: { routeCount?: number }) => {
          calls.push(`post-build:${routeCount}`);
          return {
            d1SeedPath: null,
            refreshedPlanDbPath: null,
          };
        },
        writeReport: async (summary: unknown) => {
          reports.push(summary);
          return "/tmp/network-summary.json";
        },
        persistBatchProgress: async () => {},
      } as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        skippedBuiltRouteCount: 1,
        resumedRouteIds: ["T1"],
        builtRouteIds: ["T1", "T2"],
        builtRouteCount: 1,
        failedRoutes: [{ routeId: "T3", error: "earlier failure" }],
      }),
    );
    expect(calls).toEqual(["build:T2", "post-build:2"]);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        skippedBuiltRouteCount: 1,
        remainingRouteCount: 1,
        builtRouteIds: ["T1"],
        failedRoutes: [{ routeId: "T3", error: "earlier failure" }],
      }),
    );
  });
});
