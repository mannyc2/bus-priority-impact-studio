import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RPubHeader,
  RPubInterventionCard,
  RPubSlowCard,
  routePublicLede,
} from "../../src/components/route/RoutePublicAtoms";
import type {
  RouteDossierSummaryForDetail,
  StudioRoute,
  StudioRouteEvidenceBundle,
  StudioSegment,
} from "../../src/studio/api-contract";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15",
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
  diagnosis: "M15 runs at 5.9 mph in the release projection.",
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

const noLedeRoute = {
  ...route,
  speedMph: 0,
  scheduledMph: 0,
  weightedAvgSpeed: 0,
  speedPercentile: 0,
  movement6mPct: null,
} satisfies StudioRoute;

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
  worstSegment: {
    segmentId: "seg-1",
    direction: "SB",
    label: "86 St to 59 St",
    averageSpeedMph: 4.8,
    persistenceMonths: 6,
    dataAsOf: "2026-03",
  },
  treatmentPosture: {
    aceActive: true,
    aceSince: "2021-10-01",
    busLaneMatchedLaneCount: 4,
    latestEvents: [],
    dataAsOf: "2026-03",
  },
} satisfies RouteDossierSummaryForDetail;

const segment = {
  id: "seg-1",
  routeSlug: "m15-sbs",
  direction: "SB",
  from: "86 St",
  to: "59 St",
  speedMph: 4.8,
  scheduledMph: 9.2,
  riderHours: 1234,
  lane: "partial",
  ace: true,
  tsp: false,
  hours: Array.from({ length: 24 }, (_, hour) => (hour >= 7 && hour <= 9 ? 3.8 : 6.1)),
  miles: 0.7,
} satisfies StudioSegment;

const evidence = {
  routeId: "M15+",
  routeSlug: "m15-sbs",
  wikiRouteRecordId: "route_m15",
  wikiRouteIds: ["M15"],
  wikiAliases: ["M15 SBS"],
  coverage: {
    timelineCount: 1,
    interventionCount: 0,
    metricClaimCount: 0,
    projectCount: 0,
    sourceGapCount: 0,
    citationCount: 1,
  },
  timeline: [],
  interventions: [],
  metricClaims: [],
  projects: [],
  sourceGaps: [],
  citations: [
    {
      key: "m15#progress",
      sourceId: "m15-progress",
      blockId: "block-1",
      evidenceId: "m15#progress",
      sourcePath: "raw/m15-progress.jsonl",
      sourceTitle: "M15 Progress Report",
      publisher: "MTA",
      publishedDate: "2025-01",
    },
  ],
} satisfies StudioRouteEvidenceBundle;

describe("route public atoms", () => {
  test("builds a public lede from served fields and omits it when inputs are absent", () => {
    expect(routePublicLede({ route, dossier })).toBe(
      "M15 is running 5.8 mph against a 9.2 mph schedule; down 4.2% in six months; slower than 82% of comparable routes; 86 St to 59 St is the slowest stretch in the route record.",
    );

    const emptyLede = routePublicLede({ route: noLedeRoute, dossier: null });
    const markup = renderToStaticMarkup(
      createElement(RPubHeader, {
        route: noLedeRoute,
        lede: emptyLede,
        stats: createElement("div", null, "Stats"),
      }),
    );

    expect(emptyLede).toBeNull();
    expect(markup).not.toContain("placeholder");
    expect(markup).not.toContain("slower than");
  });

  test("renders slow cards with and without served hourly profile data", () => {
    const withHours = renderToStaticMarkup(
      createElement(RPubSlowCard, {
        segment,
        rank: 1,
        routeMedianMph: 6.7,
        badge: "Slowest stretch",
        note: createElement("span", null, "Source note"),
      }),
    );
    const withoutHours = renderToStaticMarkup(
      createElement(RPubSlowCard, {
        segment: { ...segment, hours: [] },
        rank: 1,
        routeMedianMph: 6.7,
        badge: null,
        note: null,
      }),
    );

    expect(withHours).toContain("Hourly speed profile");
    expect(withHours).toContain("4.8 mph");
    expect(withHours).toContain("1.9 mph below the route median");
    expect(withoutHours).not.toContain("Hourly speed profile");
  });

  test("renders intervention card citations from wiki evidence", () => {
    const markup = renderToStaticMarkup(
      createElement(RPubInterventionCard, {
        dateLabel: "2025-01",
        yearLabel: "2025",
        kind: "bus_lane",
        title: "Bus lane begins",
        detail: "A documented intervention appears in the route source record.",
        tone: "good",
        sourceLabel: "MTA-wiki",
        citationKeys: ["m15#progress"],
        evidence,
      }),
    );

    expect(markup).toContain("M15 Progress Report");
    expect(markup).toContain("MTA");
    expect(markup).toContain("2025-01");
  });
});
