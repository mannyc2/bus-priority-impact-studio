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
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionObservationBundle,
  StudioSegment,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

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
  schemaVersion: 2,
  generatedAt: "2026-06-12T00:00:00.000Z",
  routeId: "M15+",
  routeSlug: "m15-sbs",
  releaseId: "pub_20260612T000000000Z",
  publishedAt: "2026-06-12T00:00:00.000Z",
  coverage: { start: null, end: isoMonthFixture("2026-03") },
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
    releaseId: "pub_20260612T000000000Z",
    publishedAt: "2026-06-12T00:00:00.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
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

function buswayInventory(): StudioRouteInterventionInventoryBundle {
  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: "pub_20260718T180527000Z",
    publishedAt: "2026-07-18T18:05:27.000Z",
    coverage: { start: null, end: isoMonthFixture("2026-03") },
    route: {
      routeId: "M15+",
      routeFamilyId: "M15",
      displayLabel: "M15 SBS",
      officialLongName: null,
      designationLiterals: ["route_type:SBS"],
      serviceModes: ["sbs"],
      routeTypes: ["SBS"],
      tripTypes: ["14"],
    },
    routeSlug: "m15-sbs",
    coverageState: "available",
    sourceStates: [],
    treatments: [
      {
        treatmentId: "treatment:v1:000000000000000000000001",
        sourceNamespace: "reviewed_intervention_corpus",
        sourceRecordId: "generic-record",
        sourceId: "fixture-source",
        componentCollection: "primary",
        componentPosition: 0,
        rawKind: "busway",
        rawLabel: null,
        treatmentKind: "busway",
        treatmentFamily: "bus_priority_lane",
        lifecycleState: "implemented",
        statusAsOf: null,
        effectiveDate: "2024-06",
        datePrecision: "month",
        geographyScope: "route",
        sourceRefs: ["source:fixture"],
        occurrenceIds: [],
        projectIds: [],
      },
    ],
    occurrences: [],
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
  };
}

const ACE_TREATMENT_ID = "treatment:v1:000000000000000000000082";
const ACE_OCCURRENCE_ID = "occurrence:v1:000000000000000000000082";

function aceInventory(): StudioRouteInterventionInventoryBundle {
  return {
    ...buswayInventory(),
    treatments: [
      {
        treatmentId: ACE_TREATMENT_ID,
        sourceNamespace: "reviewed_intervention_corpus",
        sourceRecordId: "ace-record",
        sourceId: "mta_ace_routes",
        componentCollection: "primary",
        componentPosition: 0,
        rawKind: "automated_bus_lane_enforcement",
        rawLabel: null,
        treatmentKind: "automated_bus_lane_enforcement",
        treatmentFamily: "enforcement",
        lifecycleState: "implemented",
        statusAsOf: "2025-11",
        effectiveDate: "2025-11-01",
        datePrecision: "day",
        geographyScope: "route",
        sourceRefs: ["source:mta_ace_routes"],
        occurrenceIds: [ACE_OCCURRENCE_ID],
        projectIds: [],
      },
    ],
    occurrences: [
      {
        occurrenceId: ACE_OCCURRENCE_ID,
        sourceNamespace: "reviewed_intervention_corpus",
        sourceOccurrenceId: "ace-occurrence",
        sourceId: "mta_ace_routes",
        producerPhaseOrPosition: "0",
        routeId: "M15+",
        treatmentIds: [ACE_TREATMENT_ID],
        lifecycleState: "implemented",
        phase: "opening",
        rawStatus: "implemented",
        program: "ABLE",
        effectiveDate: "2025-11-01",
        datePrecision: "day",
        geographyScope: "route",
        sourceRefs: ["source:mta_ace_routes"],
        projectIds: [],
        wikiOccurrenceId: null,
        registryLineage: null,
      },
    ],
  };
}

function aceObservations(): StudioRouteInterventionObservationBundle {
  const points = [
    { month: isoMonthFixture("2025-10"), value: 6.2, sampleCount: 31 },
    { month: isoMonthFixture("2025-11"), value: null, sampleCount: null },
    { month: isoMonthFixture("2025-12"), value: 6, sampleCount: 30 },
  ];

  return {
    artifactKind: "bp.studio.route_intervention_observations.v1",
    schemaVersion: 1,
    releaseId: "pub_20260718T180527000Z",
    publishedAt: "2026-07-18T18:05:27.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
    route: aceInventory().route,
    routeId: "M15+",
    routeSlug: "m15-sbs",
    dataCoverage: {
      start: isoMonthFixture("2025-10"),
      end: isoMonthFixture("2025-12"),
      grain: "month",
    },
    inputRefs: [
      {
        dataProductId: "studio_route_intervention_inventory",
        role: "event_anchor",
        featureGrain: null,
        resolverId: null,
      },
      {
        dataProductId: "local_route_month_trends_history",
        role: "observation_source",
        featureGrain: "route_metric_history",
        resolverId: "sqlite.local_route_month_trend.history.v1",
      },
    ],
    events: [
      {
        eventId: "observation-event:v1:000000000000000000000082",
        occurrenceId: ACE_OCCURRENCE_ID,
        treatmentId: ACE_TREATMENT_ID,
        routeId: "M15+",
        treatmentKind: "automated_bus_lane_enforcement",
        analysisFamily: "automated_bus_lane_enforcement",
        specId: "automated_bus_lane_enforcement_route_observations_v1",
        program: "ABLE",
        sourceId: "mta_ace_routes",
        implementationDate: "2025-11-01",
        implementationMonth: isoMonthFixture("2025-11"),
        datePrecision: "day",
        geographyScope: "route",
        resolutionStatus: "partial",
        series: [
          {
            bindingId: "route_speed_around_implementation_v1",
            metricId: "route_average_speed_mph",
            label: "Observed average speed",
            unit: "mph",
            role: "primary_outcome",
            grain: "month",
            dataProductId: "local_route_month_trends_history",
            resolverId: "sqlite.local_route_month_trend.history.v1",
            claimCeiling: "descriptive_observation",
            presentationPriority: 1,
            status: "partial",
            coverage: {
              requestedStart: isoMonthFixture("2025-10"),
              requestedEnd: isoMonthFixture("2025-12"),
              expectedPointCount: 3,
              observedStart: isoMonthFixture("2025-10"),
              observedEnd: isoMonthFixture("2025-12"),
              observedPointCount: 2,
              nullPointCount: 1,
            },
            points,
            limitations: [],
          },
        ],
      },
    ],
    limitations: [],
  };
}

const BUS_LANE_TREATMENT_ID = "treatment:v1:000000000000000000000093";
const BUS_LANE_OCCURRENCE_ID = "occurrence:v1:000000000000000000000093";
const ROUTE_CONTEXT_METHOD_LIMITATION =
  "Route-level observations are context for a treatment scoped below the full route.";

function corridorBusLaneInventory(): StudioRouteInterventionInventoryBundle {
  const inventory = aceInventory();
  const treatment = inventory.treatments[0];
  const occurrence = inventory.occurrences[0];
  if (treatment === undefined || occurrence === undefined) {
    throw new Error("ACE fixture must include one treatment and occurrence");
  }
  return {
    ...inventory,
    treatments: [
      {
        ...treatment,
        treatmentId: BUS_LANE_TREATMENT_ID,
        sourceRecordId: "bus-lane-record",
        sourceId: "nyc_dot_bus_lanes",
        rawKind: "bus_lane",
        treatmentKind: "bus_lane",
        treatmentFamily: "bus_priority_lane",
        geographyScope: "corridor",
        sourceRefs: ["source:nyc_dot_bus_lanes"],
        occurrenceIds: [BUS_LANE_OCCURRENCE_ID],
      },
    ],
    occurrences: [
      {
        ...occurrence,
        occurrenceId: BUS_LANE_OCCURRENCE_ID,
        sourceOccurrenceId: "bus-lane-occurrence",
        sourceId: "nyc_dot_bus_lanes",
        treatmentIds: [BUS_LANE_TREATMENT_ID],
        program: null,
        geographyScope: "corridor",
        sourceRefs: ["source:nyc_dot_bus_lanes"],
      },
    ],
  };
}

function corridorBusLaneObservations(): StudioRouteInterventionObservationBundle {
  const observations = aceObservations();
  const event = observations.events[0];
  const series = event?.series[0];
  if (event === undefined || series === undefined) {
    throw new Error("ACE observation fixture must include one event and series");
  }
  return {
    ...observations,
    events: [
      {
        ...event,
        eventId: "observation-event:v1:000000000000000000000093",
        occurrenceId: BUS_LANE_OCCURRENCE_ID,
        treatmentId: BUS_LANE_TREATMENT_ID,
        treatmentKind: "bus_lane",
        analysisFamily: "bus_lane",
        specId: "bus_lane_route_observations_v1",
        program: null,
        sourceId: "nyc_dot_bus_lanes",
        geographyScope: "corridor",
        series: [
          {
            ...series,
            bindingId: "bus_lane_route_speed_around_implementation_v1",
            role: "context",
            limitations: [ROUTE_CONTEXT_METHOD_LIMITATION],
          },
        ],
      },
    ],
  };
}

describe("OverviewSection", () => {
  test("renders summary, trend chart, mini map, and ranked insights for a full route", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({}),
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("M15-SBS at a glance");
    /* The speed scalar belongs to the header stat and the Slow-segments
       readout; a third copy in prose is what let the page contradict itself. */
    expect(markup).not.toContain("runs 5.8 mph");
    expect(markup).not.toContain("against a 9.2 mph schedule");
    expect(markup).toContain("Speed is down 4.2% over the past six months.");
    expect(markup).toContain("It is slower than 82% of comparable routes.");
    expect(markup).not.toContain("ACE"); // prose/legacy route fields never infer treatment badges
    expect(markup).toContain("Treatment inventory unavailable");
    expect(markup).toContain("42.0K riders/day");
    expect(markup).toContain("Speed history");
    expect(markup).toContain("Monthly observed average speed.");
    expect(markup).toContain("6 months");
    expect(markup).toContain("Route map");
    expect(markup).toContain("Observed speed by segment.");
    expect(markup).toContain("Explore route segments");
    expect(markup).not.toContain("Full map");
    expect(markup).toContain("What stands out");
  });

  test("the Route map card is the interactive map, with its speed legend", () => {
    /* Plan 126: Overview's static SVG mini map and the Slow-segments
       interactive map were the same segment speeds twice. The interactive one
       lives here now, so the legend that reads its colors lives here too. */
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({}),
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("under 5 mph");
    expect(markup).toContain("5–6.5 mph");
    expect(markup).toContain("over 6.5 mph");
    expect(markup).toContain("no data");
    expect(markup).toContain("current all day");
    /* The overlay control appears only once verified lane coverage exists; the
       route facts have not resolved during a server render. */
    expect(markup).not.toContain("Painted bus lanes (DOT)");
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
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );

    // Summary falls back to the plain diagnosis when no served part exists.
    expect(sparse).toContain("M15-SBS route dossier is still building.");
    expect(sparse).toContain("No route speed history is attached yet.");
    /* No insights renders nothing — no substitute card. */
    expect(sparse).not.toContain("No flags raised");
    // OverviewSection's own output carries no doctrine violations.
    expect(sparse).not.toContain("·");
    expect(sparse).not.toContain("The route right now");
    expect(sparse).not.toContain("tracking-[0.12em]");
  });

  test("recognizes a typed busway with generic prose and never promotes prose alone", () => {
    const typed = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({ route: { ...baseRoute, diagnosis: "Generic corridor record." } }),
        inventory: buswayInventory(),
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );
    expect(typed).toContain("Busway, Implemented");
    expect(typed).toContain("BWY");

    const proseOnly = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({
          route: { ...baseRoute, diagnosis: "A busway is mentioned only in narrative prose." },
          dossier: null,
        }),
        inventory: null,
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );
    expect(proseOnly).not.toContain("Busway, Implemented");
    expect(proseOnly).toContain("Treatment inventory unavailable");
  });

  test("uses typed observation points for speed-card metadata and keeps null months", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({}),
        inventory: aceInventory(),
        observations: aceObservations(),
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("Monthly observed average speed.");
    expect(markup).toContain("3 months");
    expect(markup).not.toContain(">6 months</span>");
    expect(markup).not.toContain("2025-10 to 2025-12");
  });

  test("labels corridor-scoped route speed as context and shows the method limitation", () => {
    const markup = renderToStaticMarkup(
      createElement(OverviewSection, {
        data: detail({}),
        inventory: corridorBusLaneInventory(),
        observations: corridorBusLaneObservations(),
        search: {},
        onSearchChange: () => undefined,
        onNavigate: () => undefined,
      }),
    );

    expect(markup).toContain("Route average speed (context)");
    expect(markup).toContain(ROUTE_CONTEXT_METHOD_LIMITATION);
    expect(markup).not.toContain("occurrence:observation-event");
  });
});
