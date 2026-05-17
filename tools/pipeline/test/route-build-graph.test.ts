import { describe, expect, test } from "bun:test";
import {
  buildAllRoutesGraph,
  buildAllRoutesGraphFromCli,
} from "../src/jobs/build/route-build-graph.js";

describe("all-routes build graph", () => {
  test("builds explicit route ids and runs graph finalization once", async () => {
    const calls: string[] = [];
    const deps = {
      buildRouteSliceArtifacts: async ({ routeId }: { routeId?: string }) => {
        calls.push(`build:${routeId}`);
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
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return {
          isoMonth: "2026-08",
          routeCount: 2,
          status: "pass",
          issueCount: 0,
          missingArtifactCount: 0,
          hashMismatchCount: 0,
          byteLengthMismatchCount: 0,
          artifactCount: 18,
          totalByteLength: 200,
        };
      },
      buildBriefArtifacts: async () => {
        calls.push("brief-artifacts");
        return {
          isoMonth: "2026-08",
          routeBriefCount: 2,
          corridorBriefCount: 1,
          routeArtifactCount: 6,
          corridorArtifactCount: 3,
          totalByteLength: 200,
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
      buildRouteReliabilityBaseline: async () => {
        calls.push("reliability");
        return {
          isoMonth: "2026-08",
          routeCount: 2,
          headwaySampleCount: 12,
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
      buildCorridorShapeReview: async () => {
        calls.push("shape-review");
        return { isoMonth: "2026-08", passRouteCount: 2 };
      },
      buildEvaluationArtifacts: async () => {
        calls.push("evaluation-artifacts");
        return { isoMonth: "2026-08", artifactCount: 3 };
      },
      buildMapArtifacts: async () => {
        calls.push("map-artifacts");
        return { isoMonth: "2026-08", artifactCount: 5 };
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
      listSelectedPlanRoutes: async () => {
        calls.push("planned:routes");
        return ["T9"];
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
    };

    const result = await buildAllRoutesGraph(
      {
        year: 2026,
        month: 8,
        isoMonth: "2026-08",
        routes: ["T1", "T2"],
        hotspotLimit: 10,
        topSegmentLimit: 5,
        refreshSharedSources: true,
        refreshPlan: false,
        exportD1: true,
        dbPath: "/tmp/pipeline.sqlite",
      },
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth: "2026-08",
        builtRouteIds: ["T1", "T2"],
        builtRouteCount: 2,
        totalBatchRouteCount: 2,
        d1SeedPath: "/tmp/seed.sql",
      }),
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        "shared:ace-routes",
        "shared:ace-violations",
        "shared:bus-lanes",
        "build:T1",
        "build:T2",
        "comparison:2",
        "intervention-evaluation",
        "corridor-model",
        "shape-review",
        "evaluation-artifacts",
        "map-artifacts",
        "brief-artifacts",
        "reliability",
        "audit",
        "export:d1:false",
      ]),
    );
  });

  test("can resolve planned route ids before building", async () => {
    const calls: string[] = [];
    const deps = {
      buildRouteSliceArtifacts: async ({ routeId }: { routeId?: string }) => {
        calls.push(`build:${routeId}`);
        return {
          routeId: routeId ?? "",
          isoMonth: "2026-08",
          segmentSpeedRows: 20,
          ridershipWindows: 4,
          scheduleTimepoints: 12,
          hotspotCount: 2,
          routeScore: 40,
          artifactCount: 9,
        };
      },
      buildRouteBatchAudit: async () => {
        calls.push("audit");
        return {
          isoMonth: "2026-08",
          routeCount: 1,
          status: "pass",
          issueCount: 0,
          missingArtifactCount: 0,
          hashMismatchCount: 0,
          byteLengthMismatchCount: 0,
          artifactCount: 9,
          totalByteLength: 100,
        };
      },
      buildBriefArtifacts: async () => {
        calls.push("brief-artifacts");
        return {
          isoMonth: "2026-08",
          routeBriefCount: 1,
          corridorBriefCount: 1,
          routeArtifactCount: 3,
          corridorArtifactCount: 3,
          totalByteLength: 100,
        };
      },
      buildRouteComparison: async ({ limit }: { limit?: number }) => {
        calls.push(`comparison:${limit}`);
        return {
          isoMonth: "2026-08",
          routeCount: limit ?? 0,
          worstRouteId: "T9",
        };
      },
      buildRouteReliabilityBaseline: async () => {
        calls.push("reliability");
        return {
          isoMonth: "2026-08",
          routeCount: 1,
          headwaySampleCount: 6,
        };
      },
      buildRouteInterventionEvaluation: async () => {
        calls.push("intervention-evaluation");
        return {
          isoMonth: "2026-08",
          routeCount: 1,
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
          publicRouteCount: 1,
          corridorCount: 1,
          assignedRouteCount: 1,
          ambiguousRouteCount: 0,
          unassignedRouteCount: 0,
          corridorHotspotCount: 1,
        };
      },
      buildCorridorShapeReview: async () => {
        calls.push("shape-review");
        return { isoMonth: "2026-08", passRouteCount: 1 };
      },
      buildEvaluationArtifacts: async () => {
        calls.push("evaluation-artifacts");
        return { isoMonth: "2026-08", artifactCount: 3 };
      },
      buildMapArtifacts: async () => {
        calls.push("map-artifacts");
        return { isoMonth: "2026-08", artifactCount: 5 };
      },
      exportD1Seed: async ({ runAudit }: { runAudit?: boolean }) => {
        calls.push(`export:d1:${String(runAudit)}`);
        return {
          isoMonth: "2026-08",
          schemaPath: "/tmp/schema.sql",
          seedPath: "/tmp/seed.sql",
          routeCount: 1,
          artifactRowCount: 9,
          comparisonRowCount: 1,
          routeCatalogRowCount: 3,
          routeCoverageRowCount: 3,
          routeReadinessRowCount: 3,
          routeBuildPlanRowCount: 3,
          routeBatchStatusRowCount: 1,
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
      listSelectedPlanRoutes: async () => {
        calls.push("planned:routes");
        return ["T9"];
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
    };

    const result = await buildAllRoutesGraphFromCli(
      [
        "--planned",
        "--year",
        "2026",
        "--month",
        "8",
        "--limit",
        "1",
        "--db",
        "/tmp/pipeline.sqlite",
      ],
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        builtRouteIds: ["T9"],
        refreshedPlanDbPath: "/tmp/pipeline.sqlite",
      }),
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        "planned:routes",
        "build:T9",
        "comparison:1",
        "intervention-evaluation",
        "corridor-model",
        "shape-review",
        "evaluation-artifacts",
        "map-artifacts",
        "brief-artifacts",
        "plan:20",
        "export:d1:false",
      ]),
    );
  });
});
