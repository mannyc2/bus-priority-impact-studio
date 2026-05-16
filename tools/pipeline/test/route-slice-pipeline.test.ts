import { describe, expect, test } from "bun:test";
import { buildRouteSliceArtifacts } from "../src/jobs/build/route-slice-pipeline.js";

describe("route slice pipeline", () => {
  test("builds the full artifact set for one requested route", async () => {
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
    };

    const result = await buildRouteSliceArtifacts(
      {
        routeId: "M1",
        year: 2026,
        month: 4,
      },
      deps as never,
    );

    expect(result).toEqual({
      routeId: "M1",
      isoMonth: "2026-04",
      segmentSpeedRows: 10,
      ridershipWindows: 2,
      scheduleTimepoints: 20,
      hotspotCount: 3,
      routeScore: 16,
    });
    expect(calls).toContain("brief:M1");
  });
});
