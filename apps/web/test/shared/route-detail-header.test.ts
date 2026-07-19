import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteDetailHeader } from "../../src/components/route/RouteDetailHeader";
import type { RouteDossierSummaryForDetail, StudioRoute } from "../../src/studio/api-contract";

const baseRoute = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15-SBS",
  routeSchemaVersion: 2,
  routeFamilyId: "M15",
  displayLabel: "M15-SBS",
  officialLongName: "East Harlem - South Ferry",
  designationLiterals: ["route_type:SBS", "trip_type:14"],
  serviceModes: ["sbs"],
  routeTypes: ["SBS"],
  tripTypes: ["14"],
  corridor: "First / Second",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 6.3,
  scheduledMph: 9.2,
  weightedAvgSpeed: 6.3,
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
  diagnosis: "M15 route detail header fixture.",
  spark: [6.5, 6.3],
  termini: { north: "125 St", south: "South Ferry" },
  miles: 8.9,
  stops: 42,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

const baseDossier = {
  artifactKind: "studio_route_dossier_summary",
  schemaVersion: 1,
  generatedAt: "2026-06-12T00:00:00.000Z",
  routeId: "M15+",
  routeSlug: "m15-sbs",
  releaseMonth: "2026-05",
  dataAsOf: "2026-05",
  speed: {
    current: 6.3,
    movement6mPct: -4.2,
    peerPercentile: 18,
    dataAsOf: "2026-05",
    sparkline: [
      { month: "2025-12", value: 6.6 },
      { month: "2026-05", value: 6.3 },
    ],
  },
  ridership: {
    current: 42_000,
    movement6mPct: 2.2,
    peerPercentile: 80,
    dataAsOf: "2026-05",
    sparkline: [],
  },
  worstSegment: null,
  treatmentPosture: {
    aceActive: true,
    aceSince: "2021-10-01",
    busLaneMatchedLaneCount: 4,
    latestEvents: [],
    dataAsOf: "2026-05",
  },
} satisfies RouteDossierSummaryForDetail;

function render(route: StudioRoute, dossier: RouteDossierSummaryForDetail | null): string {
  return renderToStaticMarkup(createElement(RouteDetailHeader, { route, dossier }));
}

describe("RouteDetailHeader (plan 053)", () => {
  test("renders speed, a dated month sub, signed movement, and compact riders", () => {
    const html = render(baseRoute, baseDossier);

    expect(html).toContain("6.3 mph");
    expect(html).toContain("May 2026");
    expect(html).toContain("4.2%");
    expect(html).toContain("42.0K");
    expect(html).toContain("8.9 miles, 42 stops");
  });

  test("shows the roundel and a borough chip, never a '{borough} route' kicker or interpunct", () => {
    const html = render(baseRoute, baseDossier);

    expect(html).toContain("M15-SBS");
    expect(html).toContain("Manhattan");
    expect(html).not.toContain("Manhattan route");
    expect(html).not.toContain("·");
  });

  test("renders a positive six-month change with an explicit + sign", () => {
    const html = render(baseRoute, {
      ...baseDossier,
      speed: { ...baseDossier.speed, movement6mPct: 2.5 },
    });

    expect(html).toContain("+2.5%");
  });

  test("null movement falls back to an em-dash and 'not enough history'", () => {
    const html = render({ ...baseRoute, movement6mPct: null }, null);

    expect(html).toContain("not enough history");
    expect(html).toContain("—");
    // dataAsOf is absent without a dossier, so the speed sub degrades honestly.
    expect(html).toContain("observed average");
  });

  test("zero riders fall back to an em-dash and 'not yet measured'", () => {
    const html = render({ ...baseRoute, dailyRiders: 0 }, baseDossier);

    expect(html).toContain("not yet measured");
    expect(html).toContain("—");
  });
});
