import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteHeader } from "../../src/components/route/RouteHeader";
import type { StudioRoute } from "../../src/studio/api-contract";

const routeFixture = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15",
  corridor: "First / Second Av",
  corridorFull: "First / Second Av",
  borough: "Manhattan",
  sbs: true,
  speedMph: 6.4,
  scheduledMph: 7.2,
  weightedAvgSpeed: 6.4,
  speedPercentile: 22,
  dailyRiders: 42000,
  ridersYoyPct: 1.2,
  riderHoursLost: 1200,
  laneCoverage: 72,
  aceStatus: "active",
  aceSince: "2024-01",
  tspCoverage: "partial",
  reliability: "Observed",
  observedReliability: null,
  diagnosis: "Route fixture.",
  spark: [6.8, 6.7, 6.4],
  termini: { north: "E 126 St", south: "South Ferry" },
  miles: 8.1,
  stops: 42,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

describe("RouteHeader", () => {
  test("renders the route dossier archetype as header context", () => {
    const html = renderToStaticMarkup(
      createElement(RouteHeader, {
        route: routeFixture,
        contextLabel: "Flagship dossier",
        metricStrip: createElement("div", null, "metrics"),
      }),
    );

    expect(html).toContain("Flagship dossier");
    expect(html).toContain("metrics");
  });
});
