import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReliabilitySection } from "../../src/components/route/ReliabilitySection";
import { RidersSection } from "../../src/components/route/RidersSection";
import type { StudioRoute, StudioRouteDetailResponse } from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

const observedReliability = {
  month: "2026-03",
  runId: "bus-observatory-2026-03",
  source: "third_party_recovered",
  releaseLayer: "observed_release",
  reliabilityStatus: "observed",
  sampleCount: 5848,
  medianObservedHeadwayMinutes: 7.25,
  p90ObservedHeadwayMinutes: 19.9,
  observedBunchingShare: 0.121,
  observedLongGapShare: 0.314,
  excessWaitMinutes: 6.72,
  caveats: ["Recovered GTFS-RT evidence has separate provenance."],
} satisfies NonNullable<StudioRoute["observedReliability"]>;

const routeDetail = {
  schemaVersion: 3,
  generatedAt: "2026-07-01T00:00:00.000Z",
  releaseId: "pub_20260701T000000000Z",
  publishedAt: "2026-07-01T00:00:00.000Z",
  coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
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
    ridersYoyPct: 2.1,
    riderHoursLost: 6200,
    laneCoverage: 65,
    aceStatus: "active",
    aceSince: "2024",
    tspCoverage: "none",
    reliability: "High attention route",
    observedReliability,
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
      spineSegmentId: "m15-n-stop-a-stop-b",
      spineJoinStatus: "matched",
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
    releaseLayer: "published_release",
    completenessStatus: "partial_public_speed_only",
    confidence: "medium",
    caveats: [],
  },
} satisfies StudioRouteDetailResponse;

const BANNED = [
  "Ridership evidence",
  "Top segment context",
  "Route trend",
  "Evidence state",
  "Sample coverage",
  "cleared gate",
  "cleared the public gate",
  "·",
];

describe("RidersSection", () => {
  test("renders rider KPIs and no meta-metric tiles", () => {
    const markup = renderToStaticMarkup(createElement(RidersSection, { data: routeDetail }));

    expect(markup).toContain("Daily riders");
    expect(markup).toContain("Rider-hour burden");
    expect(markup).toContain("Highest-impact segment");
    expect(markup).toContain("14 St to 23 St");
    // One segment surface (plan 081): the duplicate ranked card is deleted;
    // rider-grain hourly boardings replace it.
    expect(markup).not.toContain("Top burden segments");
    expect(markup).toContain("When riders ride");
    expect(markup).toContain("grid-cols-3");
    for (const phrase of BANNED) {
      expect(markup).not.toContain(phrase);
    }
  });

  test("renders a two-column KPI grid when rider-hour burden is not measured", () => {
    const noBurden = {
      ...routeDetail,
      route: { ...routeDetail.route, riderHoursLost: null },
    } satisfies StudioRouteDetailResponse;
    const markup = renderToStaticMarkup(createElement(RidersSection, { data: noBurden }));

    expect(markup).not.toContain("Rider-hour burden");
    expect(markup).toContain("grid-cols-2");
    expect(markup).not.toContain("grid-cols-3 rounded");
  });

  test("renders equity context when served and omits it when null", () => {
    const withEquity = renderToStaticMarkup(createElement(RidersSection, { data: routeDetail }));
    expect(withEquity).toContain("Who rides here");
    expect(withEquity).toContain("No-vehicle households");
    expect(withEquity).toContain("Transit commuters");

    const withoutEquity = renderToStaticMarkup(
      createElement(RidersSection, {
        data: { ...routeDetail, equityContext: null } satisfies StudioRouteDetailResponse,
      }),
    );
    expect(withoutEquity).not.toContain("Who rides here");
    expect(withoutEquity).not.toContain("No-vehicle households");
  });
});

describe("ReliabilitySection", () => {
  test("renders rider-real wait stats and the unified signals card", () => {
    const markup = renderToStaticMarkup(createElement(ReliabilitySection, { data: routeDetail }));

    expect(markup).toContain("Waiting for the bus");
    expect(markup).toContain("Median wait");
    expect(markup).toContain("P90 wait");
    expect(markup).toContain("Excess wait");
    expect(markup).toContain("Long gaps");
    expect(markup).toContain("Signals");
    expect(markup).toContain("No public rider or reliability insight for this route yet.");
    for (const phrase of BANNED) {
      expect(markup).not.toContain(phrase);
    }
  });

  test("renders a plain-language fallback when reliability is not observed", () => {
    const markup = renderToStaticMarkup(
      createElement(ReliabilitySection, {
        data: {
          ...routeDetail,
          route: { ...routeDetail.route, observedReliability: null },
        } satisfies StudioRouteDetailResponse,
      }),
    );

    expect(markup).toContain("Reliability not yet measured");
    expect(markup).toContain("Observed headway data is not yet available for this route.");
    expect(markup).not.toContain("cleared gate");
  });
});
