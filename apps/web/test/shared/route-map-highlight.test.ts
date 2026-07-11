import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverviewSection } from "../../src/components/route/OverviewSection";
import {
  routeMapFocusSummary,
  routeMapHighlight,
} from "../../src/components/route/RouteMapSection";
import type {
  RouteSurfaceCapability,
  StudioRoute,
  StudioRouteCapability,
  StudioRouteDetailResponse,
  StudioRouteInsight,
  StudioSegment,
} from "../../src/studio/api-contract";

function segment(input: Partial<StudioSegment> & Pick<StudioSegment, "id">): StudioSegment {
  const fixture: StudioSegment = {
    id: input.id,
    spineSegmentId: null,
    spineJoinStatus: "not_built",
    routeSlug: "m14a-sbs",
    direction: "NB",
    from: "A",
    to: "B",
    speedMph: 6.4,
    scheduledMph: 8.2,
    riderHours: 1200,
    lane: "none",
    ace: false,
    tsp: false,
    hours: [],
  };
  return {
    ...fixture,
    ...input,
    id: input.id,
    spineSegmentId: input.spineSegmentId ?? fixture.spineSegmentId,
    spineJoinStatus: input.spineJoinStatus ?? fixture.spineJoinStatus,
    routeSlug: input.routeSlug ?? fixture.routeSlug,
  };
}

function insight(input: Partial<StudioRouteInsight> = {}): StudioRouteInsight {
  const fixture: StudioRouteInsight = {
    routeId: "M14A+",
    kind: "map_segment",
    placement: "map_segment",
    title: "Fixture map signal",
    shortText: "Fixture signal.",
    severity: "medium",
    detectorId: "speed_pace_hotspot",
    refs: [],
  };
  return { ...fixture, ...input, routeId: input.routeId ?? fixture.routeId };
}

function surface(state: RouteSurfaceCapability["state"]): RouteSurfaceCapability {
  return {
    state,
    reason: null,
    depth: null,
    dataAsOf: "2026-05",
    freshness: "current",
  };
}

const route = {
  slug: "b48",
  routeId: "B48",
  label: "B48",
  corridor: "Lorimer / Franklin",
  corridorFull: "Lorimer Street / Franklin Avenue",
  borough: "Brooklyn",
  sbs: false,
  speedMph: 7.1,
  scheduledMph: 8.2,
  weightedAvgSpeed: 7.1,
  speedPercentile: 42,
  dailyRiders: 9800,
  ridersYoyPct: 1.2,
  riderHoursLost: 64,
  laneCoverage: 0,
  aceStatus: "none",
  aceSince: null,
  tspCoverage: "none",
  reliability: "Building",
  observedReliability: null,
  diagnosis: "B48 has a focused route dossier.",
  spark: [7.0, 7.1],
  termini: { north: "Greenpoint", south: "Prospect Park" },
  miles: 6.1,
  stops: 32,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

const capability = {
  overallState: "ready",
  surfaces: {
    detectorFindings: surface("ready"),
    map: surface("ready"),
    ridership: surface("ready"),
    speedHistory: surface("ready"),
    treatment: surface("not_applicable"),
  },
  caveats: [],
} satisfies StudioRouteCapability;

function detail({
  insights,
  segments,
}: {
  insights: StudioRouteInsight[];
  segments: StudioSegment[];
}): StudioRouteDetailResponse {
  return {
    schemaVersion: 2,
    generatedAt: "2026-06-12T00:00:00.000Z",
    route,
    segments,
    artifactRefs: [],
    insights,
    peakWindows: [],
    slowestWindows: [],
    reliabilitySamples: [],
    capability,
    dossier: null,
    equityContext: null,
    quality: {
      releaseLayer: "current_signal",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [],
    },
  };
}

describe("routeMapHighlight", () => {
  test("uses sorted detector-targeted map segments before generic flagged fallback", () => {
    const result = routeMapHighlight(
      [segment({ id: "flagged", flagged: true }), segment({ id: "target" })],
      [
        insight({ severity: "low", target: { segmentIds: ["flagged"] } }),
        insight({ severity: "high", target: { segmentIds: ["target"] } }),
      ],
    );

    expect(result).toMatchObject({
      signalCount: 2,
      segment: { id: "target" },
    });
  });

  test("falls back to the route flagged segment when map signals do not match", () => {
    const result = routeMapHighlight(
      [segment({ id: "slow", flagged: true }), segment({ id: "other" })],
      [insight({ target: { segmentIds: ["missing"] } })],
    );

    expect(result).toMatchObject({
      signalCount: 1,
      segment: { id: "slow" },
    });
  });

  test("reports no highlight when no signal or flagged segment exists", () => {
    expect(routeMapHighlight([segment({ id: "plain" })], [])).toEqual({
      signalCount: 0,
      segment: null,
    });
  });

  test("summarizes a matched focus segment for the map section", () => {
    expect(
      routeMapFocusSummary({
        signalCount: 2,
        segment: segment({
          id: "target",
          from: "Avenue A",
          to: "Avenue B",
          speedMph: 4.8,
          riderHours: 1250,
          lane: "partial",
          ace: true,
          tsp: true,
        }),
      }),
    ).toEqual({
      value: "4.8 mph",
      sub: "Avenue A to Avenue B / 1250 rider hr / lane+ACE+TSP",
    });
  });

  test("summarizes unmatched map signals without inventing a segment", () => {
    expect(routeMapFocusSummary({ signalCount: 1, segment: null })).toEqual({
      value: "Unmatched",
      sub: "map signal",
    });
  });

  test("summarizes clear maps when no segment is flagged", () => {
    expect(routeMapFocusSummary({ signalCount: 0, segment: null })).toEqual({
      value: "Clear",
      sub: "no flag",
    });
  });

  test("renders the Overview route-map card with the geo loading state first", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({
          segments: [segment({ id: "flagged", flagged: true }), segment({ id: "target" })],
          insights: [insight({ severity: "high", target: { segmentIds: ["target"] } })],
        }),
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("Route map");
    expect(markup).toContain("Observed speed by segment.");
    expect(markup).toContain("animate-pulse");
  });
});
