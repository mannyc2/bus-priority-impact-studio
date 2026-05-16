import { describe, expect, test } from "bun:test";
import { runRoutePostBuild } from "../src/jobs/build/route-post-build.js";

describe("route post-build", () => {
  test("runs batch finalization and exports without re-auditing", async () => {
    const calls: string[] = [];
    const deps = {
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return {
          isoMonth: "2026-08",
          routeCount: 2,
          status: "pass",
          issueCount: 0,
          artifactCount: 18,
          totalByteLength: 200,
        };
      },
      buildRouteBuildPlan: async ({ limit }: { limit?: number }) => {
        calls.push(`plan:${limit}`);
        return {
          isoMonth: "2026-08",
          routeCount: 3,
          selectedRouteCount: 1,
          alreadyBuiltRouteCount: 1,
          blockedRouteCount: 0,
          backlogRouteCount: 2,
          dbPath: "/tmp/pipeline.sqlite",
        };
      },
      buildRouteComparison: async ({ limit }: { limit?: number }) => {
        calls.push(`comparison:${limit}`);
        return {
          isoMonth: "2026-08",
          routeCount: limit ?? 0,
          worstRouteId: "T1",
        };
      },
      buildRouteInterventionEvaluation: async () => {
        calls.push("intervention-evaluation");
        return {
          isoMonth: "2026-08",
          routeCount: 2,
          eventCount: 1,
          comparisonCount: 1,
          evaluatedComparisonCount: 1,
          futureComparisonCount: 0,
          insufficientComparisonCount: 0,
        };
      },
      buildCorridorModel: async () => {
        calls.push("corridor-model");
        return {
          isoMonth: "2026-08",
          publicRouteCount: 2,
          corridorCount: 1,
          assignedRouteCount: 2,
          ambiguousRouteCount: 0,
          unassignedRouteCount: 0,
          corridorHotspotCount: 1,
        };
      },
      buildRouteReliabilityBaseline: async () => {
        calls.push("reliability");
        return {
          isoMonth: "2026-08",
          routeCount: 2,
          headwaySampleCount: 12,
        };
      },
      exportD1Seed: async ({ runAudit }: { runAudit?: boolean }) => {
        calls.push(`export:d1:${String(runAudit)}`);
        return {
          isoMonth: "2026-08",
          schemaPath: "/tmp/schema.sql",
          seedPath: "/tmp/seed.sql",
          routeCount: 2,
          artifactRowCount: 18,
          comparisonRowCount: 2,
          routeCatalogRowCount: 3,
          routeCoverageRowCount: 3,
          routeReadinessRowCount: 3,
          routeBuildPlanRowCount: 3,
          routeBatchStatusRowCount: 1,
        };
      },
    };

    const result = await runRoutePostBuild(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline.sqlite",
        routeCount: 2,
        refreshPlan: true,
        exportD1: true,
      },
      deps as never,
    );

    expect(result).toEqual({
      d1SeedPath: "/tmp/seed.sql",
      refreshedPlanDbPath: "/tmp/pipeline.sqlite",
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        "comparison:2",
        "intervention-evaluation",
        "corridor-model",
        "reliability",
        "audit",
        "plan:20",
        "export:d1:false",
      ]),
    );
  });
});
