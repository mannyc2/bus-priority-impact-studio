import { describe, expect, test } from "bun:test";
import type { LocalRouteReadiness } from "@bp/db/local";
import { buildPlanRows, routeBuildPriorityScore } from "../src/local-db";

function readiness(overrides: Partial<LocalRouteReadiness>): LocalRouteReadiness {
  return {
    routeId: "M15",
    routeShortName: "M15",
    routeLongName: "Select Bus Service",
    isoMonth: "2026-03",
    readinessStatus: "ready",
    buildEligible: true,
    readinessScore: 100,
    missingInputs: [],
    speedObservationCount: 100,
    speedBusTripCount: 50,
    averageSpeedMph: 8,
    scheduleTimepointCount: 200,
    shapeCount: 2,
    stopCount: 20,
    timepointStopCount: 8,
    ...overrides,
  };
}

describe("route build plan", () => {
  test("scores slower high-readiness routes higher", () => {
    const slow = readiness({ averageSpeedMph: 7, speedObservationCount: 100 });
    const fast = readiness({ averageSpeedMph: 16, speedObservationCount: 100 });

    expect(routeBuildPriorityScore(slow)).toBeGreaterThan(routeBuildPriorityScore(fast));
  });

  test("selects ranked candidates and separates built, blocked, and backlog routes", () => {
    const rows = buildPlanRows({
      readiness: [
        readiness({ routeId: "M15", averageSpeedMph: 7 }),
        readiness({ routeId: "B1", averageSpeedMph: 14 }),
        readiness({ routeId: "Q44", averageSpeedMph: 9 }),
        readiness({
          routeId: "B46",
          buildEligible: false,
          readinessStatus: "missing_geometry",
          missingInputs: ["route_shapes"],
        }),
      ],
      alreadyBuiltRouteIds: new Set(["Q44"]),
      limit: 1,
    });

    expect(rows.map((row) => [row.routeId, row.planStatus, row.candidateRank])).toEqual([
      ["M15", "selected", 1],
      ["B1", "backlog", 2],
      ["Q44", "already_built", null],
      ["B46", "blocked", null],
    ]);
    expect(rows[0]).toMatchObject({
      routeId: "M15",
      selectedForNextBatch: true,
      alreadyBuilt: false,
      buildEligible: true,
    });
  });
});
