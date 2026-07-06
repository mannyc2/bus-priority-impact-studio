import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RidersSection, routeEquityContextItems } from "../../src/components/route/RidersSection";
import type { StudioRouteDetailResponse } from "../../src/studio/api-contract";

const routeDetail = {
  schemaVersion: 2,
  generatedAt: "2026-07-01T00:00:00.000Z",
  route: {
    slug: "m15-sbs",
    routeId: "M15+",
    label: "M15 SBS",
    corridor: "First / Second",
    corridorFull: "First Avenue / Second Avenue",
    borough: "Manhattan",
    sbs: true,
    speedMph: 7.2,
    scheduledMph: 8.4,
    weightedAvgSpeed: 7.2,
    speedPercentile: 12,
    dailyRiders: 30000,
    ridersYoyPct: 0,
    riderHoursLost: 6200,
    laneCoverage: 65,
    aceStatus: "active",
    aceSince: "2024",
    tspCoverage: "none",
    reliability: "High attention route",
    observedReliability: null,
    diagnosis: "M15 SBS has slow segments and active treatment evidence.",
    spark: [7.2, 7.4, 7.1],
    termini: { north: "East Harlem", south: "South Ferry" },
    miles: 8.1,
    stops: 42,
    flags: ["ACE active"],
    peerSlug: null,
    interventions: [],
    movement6mPct: null,
    context12mPct: null,
  },
  segments: [
    {
      id: "M15+:2026-03:N:1:stop-a:stop-b",
      routeSlug: "m15-sbs",
      direction: "NB",
      from: "14 St",
      to: "23 St",
      speedMph: 5.2,
      scheduledMph: 8.4,
      riderHours: 3100,
      lane: "partial",
      ace: true,
      tsp: false,
      hours: [6.1, 6.4, 5.9],
      flagged: true,
    },
  ],
  artifactRefs: [],
  insights: [],
  peakWindows: [],
  slowestWindows: [],
  reliabilitySamples: [],
  capability: null,
  dossier: null,
  equityContext: {
    acsYear: 2024,
    assignedCountyName: "New York County",
    totalPopulation: 1640000,
    noVehicleHouseholdShare: 0.7692,
    medianHouseholdIncome: 98000,
    povertyRate: 15.4,
    publicTransitCommuterShare: 58.2,
  },
  quality: {
    releaseLayer: "baseline_release",
    completenessStatus: "partial_public_monthly_only",
    confidence: "medium",
    caveats: [],
  },
} satisfies StudioRouteDetailResponse;

describe("RidersSection equity context", () => {
  test("normalizes fraction and percent-style ACS fields", () => {
    expect(routeEquityContextItems(routeDetail.equityContext)).toEqual([
      { label: "No-vehicle households", value: "77%" },
      { label: "Median HH income", value: "$98.0K" },
      { label: "Poverty rate", value: "15%" },
      { label: "Transit commuters", value: "58%" },
    ]);
  });

  test("renders a ruled ACS strip when at least two values exist", () => {
    const markup = renderToStaticMarkup(createElement(RidersSection, { data: routeDetail }));

    expect(markup).toContain("Who rides here");
    expect(markup).toContain("No-vehicle households");
    expect(markup).toContain("77%");
    expect(markup).toContain("$98.0K");
    // The ACS provenance line moved into the SourceNote popover (plan 056),
    // so it no longer appears in the statically rendered markup.
    expect(markup).not.toContain("ACS 2024 five-year estimates");
  });

  test("omits the ACS strip when the payload is too sparse", () => {
    const sparse = {
      ...routeDetail,
      equityContext: {
        ...routeDetail.equityContext,
        medianHouseholdIncome: null,
        povertyRate: null,
        publicTransitCommuterShare: null,
      },
    } satisfies StudioRouteDetailResponse;
    const markup = renderToStaticMarkup(createElement(RidersSection, { data: sparse }));

    expect(routeEquityContextItems(sparse.equityContext)).toHaveLength(1);
    expect(markup).not.toContain("Who rides here");
  });
});
