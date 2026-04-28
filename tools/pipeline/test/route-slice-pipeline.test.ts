import { describe, expect, test } from "bun:test";
import { buildRouteBatchArtifacts } from "../src/jobs/build/route-slice-pipeline.js";

describe("route slice batch pipeline", () => {
  test("refreshes shared sources once and builds each requested route", async () => {
    const calls: string[] = [];
    const deps = {
      ingestRouteSlice: async ({ routeId }: { routeId?: string }) => {
        calls.push(`slice:${routeId}`);
        return {
          summary: {
            normalized: {
              segmentSpeedCount: 10,
              ridershipWindowCount: 2,
            },
          },
        };
      },
      ingestSchedules: async ({ routeId }: { routeId?: string }) => {
        calls.push(`schedules:${routeId}`);
        return { timepointCount: 20 };
      },
      buildHotspots: async ({ routeId }: { routeId?: string }) => {
        calls.push(`hotspots:${routeId}`);
        return { hotspotCount: 3 };
      },
      buildRidershipProfile: async ({ routeId }: { routeId?: string }) => {
        calls.push(`ridership:${routeId}`);
        return {};
      },
      buildSpeedProfile: async ({ routeId }: { routeId?: string }) => {
        calls.push(`speed:${routeId}`);
        return {};
      },
      buildInterventionOverlay: async ({ routeId }: { routeId?: string }) => {
        calls.push(`interventions:${routeId}`);
        return {};
      },
      buildBusLaneOverlay: async ({ routeId }: { routeId?: string }) => {
        calls.push(`bus-lanes:${routeId}`);
        return {};
      },
      buildScheduleComparison: async ({ routeId }: { routeId?: string }) => {
        calls.push(`schedule-comparison:${routeId}`);
        return {};
      },
      buildRouteBriefInput: async ({ routeId }: { routeId?: string }) => {
        calls.push(`brief:${routeId}`);
        return { routeScore: routeId === "M1" ? 16 : 22 };
      },
      buildArtifactManifest: async ({ routeId }: { routeId?: string }) => {
        calls.push(`manifest:${routeId}`);
        return { artifactCount: 9 };
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
    };

    const result = await buildRouteBatchArtifacts(
      {
        routes: ["M1", "M2"],
        year: 2026,
        month: 4,
        refreshSharedSources: true,
      },
      deps as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        isoMonth: "2026-04",
        routeCount: 2,
      }),
    );
    expect(result.routes.map((route) => route.routeId)).toEqual(["M1", "M2"]);
    expect(calls.filter((call) => call.startsWith("shared:")).sort()).toEqual([
      "shared:ace-routes",
      "shared:ace-violations",
      "shared:bus-lanes",
    ]);
    expect(calls).toContain("manifest:M1");
    expect(calls).toContain("manifest:M2");
  });
});
