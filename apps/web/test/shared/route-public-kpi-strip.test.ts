import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoutePublicKpiStrip } from "../../src/components/route/RoutePublicKpiStrip";
import { routeSectionRegistry } from "../../src/components/route/section-registry";
import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteCapability,
} from "../../src/studio/api-contract";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15 SBS",
  corridor: "First / Second",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 5.9,
  scheduledMph: 9.2,
  weightedAvgSpeed: 5.9,
  speedPercentile: 20,
  dailyRiders: 42_000,
  ridersYoyPct: 2.1,
  riderHoursLost: 140,
  laneCoverage: 38,
  aceStatus: "active",
  aceSince: "2021-10-01",
  tspCoverage: "partial",
  reliability: "Building",
  observedReliability: null,
  diagnosis: "M15 SBS has a dossier speed signal.",
  spark: [6.2, 5.9],
  termini: { north: "125 St", south: "South Ferry" },
  miles: 8.1,
  stops: 28,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

const readySurface = {
  state: "ready",
  reason: null,
  depth: { monthsCovered: 6, grains: ["route_month"] },
  dataAsOf: "2026-03",
  freshness: "current",
} satisfies RouteSurfaceCapability;

const capability = {
  overallState: "ready",
  surfaces: {
    speedHistory: readySurface,
    reliability: { ...readySurface, state: "building", reason: "Reliability is building." },
    ridership: readySurface,
    treatment: readySurface,
  },
  caveats: [],
} satisfies StudioRouteCapability;

const dossier = {
  artifactKind: "studio_route_dossier_summary",
  schemaVersion: 1,
  generatedAt: "2026-06-12T00:00:00.000Z",
  routeId: "M15+",
  routeSlug: "m15-sbs",
  releaseMonth: "2026-03",
  dataAsOf: "2026-03",
  speed: {
    current: 5.8,
    movement6mPct: -4.2,
    peerPercentile: 18,
    dataAsOf: "2026-03",
    sparkline: [
      { month: "2025-10", value: 6.2 },
      { month: "2026-03", value: 5.8 },
    ],
  },
  ridership: {
    current: 42_000,
    movement6mPct: 2.2,
    peerPercentile: 80,
    dataAsOf: "2026-03",
    sparkline: [],
  },
  worstSegment: null,
  treatmentPosture: {
    aceActive: true,
    aceSince: "2021-10-01",
    busLaneMatchedLaneCount: 4,
    latestEvents: [],
    dataAsOf: "2026-03",
  },
} satisfies RouteDossierSummaryForDetail;

describe("RoutePublicKpiStrip", () => {
  test("leads the speed KPI with the observed number and keeps peer framing in the sub", () => {
    const markup = renderToStaticMarkup(
      createElement(RoutePublicKpiStrip, {
        route,
        dossier,
        capability,
        sectionRegistry: routeSectionRegistry(capability),
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("5.8");
    expect(markup).toContain("slower than 82% of peers");
    expect(markup.indexOf("5.8")).toBeLessThan(markup.indexOf("slower than 82% of peers"));
  });
});
