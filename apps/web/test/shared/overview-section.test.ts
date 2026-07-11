import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewSection } from "../../src/components/route/OverviewSection";
import type {
  RouteDossierSummaryForDetail,
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteCapability,
  StudioRouteDetailResponse,
  StudioRouteInsight,
  StudioSegment,
} from "../../src/studio/api-contract";

function surface(state: RouteSurfaceCapability["state"]): RouteSurfaceCapability {
  return { state, reason: null, depth: null, dataAsOf: "2026-03", freshness: "current" };
}

const baseRoute = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15-SBS",
  corridor: "First / Second",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 5.8,
  scheduledMph: 9.2,
  weightedAvgSpeed: 5.8,
  speedPercentile: 18,
  dailyRiders: 42_000,
  ridersYoyPct: 2.1,
  riderHoursLost: 140,
  laneCoverage: 38,
  aceStatus: "active",
  aceSince: "2021-10-01",
  tspCoverage: "partial",
  reliability: "Building",
  observedReliability: null,
  diagnosis: "M15-SBS runs at 5.8 mph in the release projection.",
  spark: [6.2, 5.8],
  termini: { north: "125 St", south: "South Ferry" },
  miles: 8.1,
  stops: 28,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
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
      { month: "2025-11", value: 6.1 },
      { month: "2025-12", value: 6.0 },
      { month: "2026-01", value: 5.9 },
      { month: "2026-02", value: 5.85 },
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
  spineSegmentId: "m15-s-seg-1",
  spineJoinStatus: "matched",
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
  hours: [],
} satisfies StudioSegment;

const insight = {
  routeId: "M15+",
  kind: "performance_annotation",
  placement: "overview",
  title: "Weekday PM speeds fall below schedule",
  shortText: "Observed PM-peak speed trails the schedule on this corridor.",
  severity: "high",
  detectorId: "speed_pace_hotspot",
  refs: [],
} satisfies StudioRouteInsight;

const readyCapability = {
  overallState: "ready",
  surfaces: {
    speedHistory: surface("ready"),
    ridership: surface("ready"),
    treatment: surface("ready"),
  },
  caveats: [],
} satisfies StudioRouteCapability;

const cleanCapability = {
  overallState: "checked_clean",
  surfaces: {
    speedHistory: surface("checked_clean"),
  },
  caveats: [],
} satisfies StudioRouteCapability;

function detail(overrides: Partial<StudioRouteDetailResponse>): StudioRouteDetailResponse {
  return {
    schemaVersion: 3,
    generatedAt: "2026-06-12T00:00:00.000Z",
    baselineMonth: "2026-03",
    route: baseRoute,
    segments: [segment],
    artifactRefs: [],
    insights: [insight],
    peakWindows: [],
    slowestWindows: [],
    reliabilitySamples: [],
    capability: readyCapability,
    dossier,
    equityContext: null,
    quality: {
      releaseLayer: "current_signal",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [],
    },
    ...overrides,
  };
}

describe("OverviewSection", () => {
  test("renders summary, trend chart, mini map, and ranked insights for a full route", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, { data: detail({}), onNavigate: () => undefined }),
    );

    expect(markup).toContain("M15-SBS at a glance");
    expect(markup).toContain("runs 5.8 mph");
    expect(markup).toContain("against a 9.2 mph schedule");
    expect(markup).toContain("Speed is down 4.2% over the past six months.");
    expect(markup).toContain("It is slower than 82% of comparable routes.");
    expect(markup).toContain("ACE"); // route treatment badge
    expect(markup).toContain("42.0K riders/day");
    expect(markup).toContain("Speed history");
    expect(markup).toContain("6 months");
    expect(markup).toContain("Route map");
    expect(markup).toContain("Observed speed by segment.");
    expect(markup).toContain("What stands out");
  });

  test("falls back to honest empty states for a sparse route", () => {
    const sparse = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({
          route: {
            ...baseRoute,
            weightedAvgSpeed: 0,
            speedPercentile: null,
            laneCoverage: 0,
            aceStatus: "none",
            aceSince: null,
            tspCoverage: "none",
            sbs: false,
            dailyRiders: 0,
            movement6mPct: null,
            diagnosis: "M15-SBS route dossier is still building.",
          },
          segments: [],
          insights: [],
          dossier: null,
          capability: cleanCapability,
        }),
        onNavigate: () => undefined,
      }),
    );

    // Summary falls back to the plain diagnosis when no served part exists.
    expect(sparse).toContain("M15-SBS route dossier is still building.");
    expect(sparse).toContain("No route speed history is attached yet.");
    expect(sparse).toContain("No flags raised");
    // OverviewSection's own output carries no doctrine violations.
    expect(sparse).not.toContain("·");
    expect(sparse).not.toContain("The route right now");
    expect(sparse).not.toContain("tracking-[0.12em]");
  });
});
