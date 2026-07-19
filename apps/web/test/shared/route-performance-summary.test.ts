import { describe, expect, test } from "bun:test";
import { routePerformanceSummary } from "../../src/components/route/route-derived";
import type { RouteDossierSummaryForDetail, StudioRoute } from "../../src/studio/api-contract";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First / Second",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 8.4,
  scheduledMph: 9.2,
  weightedAvgSpeed: 8.4,
  speedPercentile: 41,
  dailyRiders: 42000,
  ridersYoyPct: 2.1,
  riderHoursLost: 140,
  laneCoverage: 38,
  aceStatus: "active",
  aceSince: "2021-10-01",
  tspCoverage: "partial",
  reliability: "Observed",
  observedReliability: null,
  diagnosis: "M15 SBS runs at 8.4 mph in the release projection.",
  spark: [8.2, 8.4],
  termini: { north: "125 St", south: "South Ferry" },
  miles: 8.1,
  stops: 28,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

function dossier(current: number | null): RouteDossierSummaryForDetail {
  return {
    artifactKind: "studio_route_dossier_summary",
    schemaVersion: 2,
    generatedAt: "2026-06-10T00:00:00.000Z",
    routeId: "M15+",
    routeSlug: "m15-sbs",
    releaseId: "pub_20260610T000000000Z",
    publishedAt: "2026-06-10T00:00:00.000Z",
    coverage: { start: null, end: "2026-03" },
    dataAsOf: "2026-05",
    speed: {
      current,
      movement6mPct: -4.2,
      peerPercentile: 21,
      sparkline: [
        { month: "2025-12", value: 9.0 },
        { month: "2026-05", value: current },
      ],
      dataAsOf: "2026-05",
    },
    ridership: {
      current: 42000,
      movement6mPct: 3.1,
      peerPercentile: 96,
      sparkline: [],
      dataAsOf: "2026-03",
    },
    worstSegment: null,
    treatmentPosture: {
      aceActive: true,
      aceSince: "2021-10-01",
      busLaneMatchedLaneCount: 4,
      latestEvents: [],
      dataAsOf: "2026-03",
    },
  };
}

describe("route performance summary", () => {
  test("uses dossier speed for the overview summary when current speed is present", () => {
    const summary = routePerformanceSummary(route, dossier(8.6));

    expect(summary).toEqual({
      speedMph: 8.6,
      peerPercentile: 21,
      dataAsOf: "2026-05",
      lead: "M15 SBS: 8.6 mph, -4.2% 6 mo.",
    });
    expect(summary.lead).not.toContain("8.4 mph");
  });

  test("falls back to the route projection when no dossier current speed exists", () => {
    expect(routePerformanceSummary(route, dossier(null))).toEqual({
      speedMph: 8.4,
      peerPercentile: 41,
      dataAsOf: null,
      lead: route.diagnosis,
    });
  });
});
