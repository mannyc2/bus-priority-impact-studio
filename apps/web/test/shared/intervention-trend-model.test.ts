import { describe, expect, test } from "bun:test";
import {
  BUS_LANE_ROUTE_SPEED_OBSERVATION_BINDING_ID,
  BUSWAY_ROUTE_SPEED_OBSERVATION_BINDING_ID,
  ROUTE_SPEED_OBSERVATION_BINDING_ID,
  ROUTE_SPEED_OBSERVATION_METRIC_ID,
  routeSpeedInterventionTrend,
} from "../../src/components/route/intervention-trend-model";
import type { TrendPoint } from "../../src/components/route/route-derived";
import { treatmentRecordAnchorId } from "../../src/components/route/route-intervention-model";
import type {
  StudioRouteInterventionInventoryBundle,
  StudioRouteInterventionObservationBundle,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

type ObservationEvent = StudioRouteInterventionObservationBundle["events"][number];
type ObservationSeries = ObservationEvent["series"][number];
type ObservationMonth = ObservationSeries["points"][number]["month"];
type InventoryTreatment = StudioRouteInterventionInventoryBundle["treatments"][number];
type InventoryOccurrence = StudioRouteInterventionInventoryBundle["occurrences"][number];

const ROUTE_ID = "B44+";
const ROUTE_SLUG = "b44-sbs";

const TREATMENT_IDS = {
  first: "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa",
  second: "treatment:v1:bbbbbbbbbbbbbbbbbbbbbbbb",
  third: "treatment:v1:cccccccccccccccccccccccc",
} as const;

const OCCURRENCE_IDS = {
  first: "occurrence:v1:111111111111111111111111",
  second: "occurrence:v1:222222222222222222222222",
  third: "occurrence:v1:333333333333333333333333",
} as const;

const DOSSIER_POINTS: readonly TrendPoint[] = [
  { month: "2023-11", value: 6.1 },
  { month: "2023-12", value: null },
];

const ROUTE_CONTEXT_METHOD_LIMITATION =
  "Route-level observations are context for a treatment scoped below the full route.";

const EVENT_IDENTITIES = {
  automated_bus_lane_enforcement: {
    analysisFamily: "automated_bus_lane_enforcement",
    specId: "automated_bus_lane_enforcement_route_observations_v1",
    bindingId: ROUTE_SPEED_OBSERVATION_BINDING_ID,
  },
  bus_lane: {
    analysisFamily: "bus_lane",
    specId: "bus_lane_route_observations_v1",
    bindingId: BUS_LANE_ROUTE_SPEED_OBSERVATION_BINDING_ID,
  },
  busway: {
    analysisFamily: "busway",
    specId: "busway_route_observations_v1",
    bindingId: BUSWAY_ROUTE_SPEED_OBSERVATION_BINDING_ID,
  },
} as const;

type SupportedTreatmentKind = keyof typeof EVENT_IDENTITIES;

function isoMonth(value: string): ObservationMonth {
  return isoMonthFixture(value);
}

function routePresentation(): StudioRouteInterventionObservationBundle["route"] {
  return {
    routeId: ROUTE_ID,
    routeFamilyId: "B44",
    displayLabel: "B44 SBS",
    officialLongName: "Sheepshead Bay - Williamsburg",
    designationLiterals: ["route_type:SBS", "trip_type:14"],
    serviceModes: ["sbs"],
    routeTypes: ["SBS"],
    tripTypes: ["14"],
  };
}

function monthRange(start: string, count: number): ObservationMonth[] {
  const [year, month] = start.split("-").map(Number) as [number, number];
  const startIndex = year * 12 + month - 1;
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    const nextYear = Math.floor(index / 12);
    const nextMonth = (index % 12) + 1;
    return isoMonth(
      `${nextYear.toString().padStart(4, "0")}-${nextMonth.toString().padStart(2, "0")}`,
    );
  });
}

type SeriesOptions = {
  bindingId?: ObservationSeries["bindingId"];
  metricId?: string;
  label?: string;
  unit?: string;
  start?: string;
  values?: readonly (number | null)[];
  status?: ObservationSeries["status"];
  role?: ObservationSeries["role"];
  limitations?: readonly string[];
  presentationPriority?: number;
};

function observationSeries(options: SeriesOptions = {}): ObservationSeries {
  const values = options.values ?? [7.8, null, 8.2];
  const months = monthRange(options.start ?? "2024-01", values.length);
  const points = months.map((month, index) => {
    const value = values[index] ?? null;
    return { month, value, sampleCount: value === null ? null : 20 + index };
  });
  const observedMonths = points.flatMap((point) => (point.value === null ? [] : [point.month]));
  const status =
    options.status ??
    (observedMonths.length === 0
      ? "missing"
      : observedMonths.length === points.length
        ? "available"
        : "partial");

  return {
    bindingId: options.bindingId ?? ROUTE_SPEED_OBSERVATION_BINDING_ID,
    metricId: options.metricId ?? ROUTE_SPEED_OBSERVATION_METRIC_ID,
    label: options.label ?? "Observed average speed",
    unit: options.unit ?? "mph",
    role: options.role ?? "primary_outcome",
    grain: "month",
    dataProductId: "local_route_month_trends_history",
    resolverId: "sqlite.local_route_month_trend.history.v1",
    claimCeiling: "descriptive_observation",
    presentationPriority: options.presentationPriority ?? 1,
    status,
    coverage: {
      requestedStart: months[0] ?? isoMonth("2024-01"),
      requestedEnd: months.at(-1) ?? isoMonth("2024-01"),
      expectedPointCount: points.length,
      observedStart: observedMonths.at(0) ?? null,
      observedEnd: observedMonths.at(-1) ?? null,
      observedPointCount: observedMonths.length,
      nullPointCount: points.length - observedMonths.length,
    },
    points,
    limitations: options.limitations ?? [],
  };
}

type EventOptions = {
  eventId?: string;
  occurrenceId?: string;
  treatmentId?: string;
  treatmentKind?: SupportedTreatmentKind;
  routeId?: string;
  implementationMonth?: string;
  series?: readonly ObservationSeries[];
  program?: string | null;
  sourceId?: string;
  geographyScope?: ObservationEvent["geographyScope"];
  resolutionStatus?: ObservationEvent["resolutionStatus"];
};

function observationEvent(options: EventOptions = {}): ObservationEvent {
  const implementationMonth = options.implementationMonth ?? "2024-02";
  const treatmentKind = options.treatmentKind ?? "automated_bus_lane_enforcement";
  const identity = EVENT_IDENTITIES[treatmentKind];
  const geographyScope = options.geographyScope ?? "route";
  const contextual = geographyScope === "corridor" || geographyScope === "segment";
  const eventSeries = options.series ?? [
    observationSeries({
      bindingId: identity.bindingId,
      role: contextual ? "context" : "primary_outcome",
      limitations: contextual ? [ROUTE_CONTEXT_METHOD_LIMITATION] : [],
    }),
  ];
  return {
    eventId: options.eventId ?? "event-b",
    occurrenceId: options.occurrenceId ?? OCCURRENCE_IDS.first,
    treatmentId: options.treatmentId ?? TREATMENT_IDS.first,
    routeId: options.routeId ?? ROUTE_ID,
    treatmentKind,
    analysisFamily: identity.analysisFamily,
    specId: identity.specId,
    program: options.program === undefined ? "ABLE" : options.program,
    sourceId: options.sourceId ?? "mta_ace_routes",
    implementationDate: `${implementationMonth}-01`,
    implementationMonth: isoMonth(implementationMonth),
    datePrecision: "day",
    geographyScope,
    resolutionStatus: options.resolutionStatus ?? eventSeries[0]?.status ?? "missing",
    series: eventSeries,
  };
}

function observationBundle(
  events: readonly ObservationEvent[],
  overrides: Partial<StudioRouteInterventionObservationBundle> = {},
): StudioRouteInterventionObservationBundle {
  const observedMonths = events.flatMap((event) =>
    event.series.flatMap((series) =>
      series.points.flatMap((point) => (point.value === null ? [] : [point.month])),
    ),
  );
  observedMonths.sort((left, right) => left.localeCompare(right));

  return {
    artifactKind: "bp.studio.route_intervention_observations.v1",
    schemaVersion: 1,
    releaseId: "pub_20260720T120000000Z",
    publishedAt: "2026-07-20T12:00:00.000Z",
    coverage: { start: isoMonth("2023-04"), end: isoMonth("2026-06") },
    route: routePresentation(),
    routeId: ROUTE_ID,
    routeSlug: ROUTE_SLUG,
    dataCoverage: {
      start: observedMonths.at(0) ?? null,
      end: observedMonths.at(-1) ?? null,
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
    events,
    limitations: [],
    ...overrides,
  };
}

function inventoryTreatment(
  treatmentId: string,
  occurrenceIds: readonly string[],
  event: ObservationEvent,
): InventoryTreatment {
  const treatmentKind = event.treatmentKind;
  return {
    treatmentId,
    sourceNamespace: "local_intervention_registry",
    sourceRecordId: `record:${treatmentId}`,
    sourceId: event.sourceId,
    componentCollection: "primary",
    componentPosition: 0,
    rawKind: treatmentKind,
    rawLabel: null,
    treatmentKind,
    treatmentFamily:
      treatmentKind === "automated_bus_lane_enforcement" ? "enforcement" : "bus_priority_lane",
    lifecycleState: "implemented",
    statusAsOf: "2026-06",
    effectiveDate: event.implementationDate,
    datePrecision: event.datePrecision,
    geographyScope: event.geographyScope,
    sourceRefs: ["source:mta_ace_routes"],
    occurrenceIds,
    projectIds: [],
  };
}

function inventoryOccurrence(
  occurrenceId: string,
  treatmentIds: readonly string[],
  event: ObservationEvent,
): InventoryOccurrence {
  return {
    occurrenceId,
    sourceNamespace: "local_intervention_registry",
    sourceOccurrenceId: `source:${occurrenceId}`,
    sourceId: event.sourceId,
    producerPhaseOrPosition: "0",
    routeId: ROUTE_ID,
    treatmentIds,
    lifecycleState: "implemented",
    phase: "opening",
    rawStatus: "implemented",
    program: event.program,
    effectiveDate: event.implementationDate,
    datePrecision: event.datePrecision,
    geographyScope: event.geographyScope,
    sourceRefs: ["source:mta_ace_routes"],
    projectIds: [],
    wikiOccurrenceId: null,
    registryLineage: null,
  };
}

function inventoryBundle(
  events: readonly ObservationEvent[],
  overrides: Partial<StudioRouteInterventionInventoryBundle> = {},
): StudioRouteInterventionInventoryBundle {
  const eventsByTreatment = new Map<string, ObservationEvent[]>();
  const eventsByOccurrence = new Map<string, ObservationEvent[]>();
  for (const event of events) {
    eventsByTreatment.set(event.treatmentId, [
      ...(eventsByTreatment.get(event.treatmentId) ?? []),
      event,
    ]);
    eventsByOccurrence.set(event.occurrenceId, [
      ...(eventsByOccurrence.get(event.occurrenceId) ?? []),
      event,
    ]);
  }
  const treatments = [...eventsByTreatment.entries()].map(([treatmentId, treatmentEvents]) =>
    inventoryTreatment(
      treatmentId,
      [...new Set(treatmentEvents.map((event) => event.occurrenceId))].sort(),
      treatmentEvents[0] as ObservationEvent,
    ),
  );
  const occurrences = [...eventsByOccurrence.entries()].map(([occurrenceId, occurrenceEvents]) =>
    inventoryOccurrence(
      occurrenceId,
      [...new Set(occurrenceEvents.map((event) => event.treatmentId))].sort(),
      occurrenceEvents[0] as ObservationEvent,
    ),
  );

  return {
    artifactKind: "bp.studio.route_intervention_inventory_bundle.v1",
    schemaVersion: 1,
    releaseId: "pub_20260720T120000000Z",
    publishedAt: "2026-07-20T12:00:00.000Z",
    coverage: { start: isoMonth("2023-04"), end: isoMonth("2026-06") },
    route: routePresentation(),
    routeSlug: ROUTE_SLUG,
    coverageState: "available",
    sourceStates: [],
    treatments,
    occurrences,
    currentState: [],
    projectRefs: [],
    sourceGaps: [],
    ...overrides,
  };
}

describe("route speed intervention trend model", () => {
  test("falls back to dossier points when either typed bundle is null", () => {
    const event = observationEvent();
    const inventory = inventoryBundle([event]);

    expect(routeSpeedInterventionTrend(null, inventory, DOSSIER_POINTS, 4)).toMatchObject({
      source: "dossier_fallback",
      points: DOSSIER_POINTS,
      markers: [],
      focalEventId: null,
    });
    expect(
      routeSpeedInterventionTrend(observationBundle([event]), null, DOSSIER_POINTS, 4),
    ).toMatchObject({ source: "dossier_fallback", markers: [] });
  });

  test("admits only the exact speed binding and metric pair", () => {
    const event = observationEvent();
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("observation_bundle");
    expect(result.focalEventId).toBe("event-b");
    expect(result.markers).toEqual([
      {
        month: "2024-02",
        label: "Enforcement starts Feb 2024",
        count: 1,
        eventIds: ["event-b"],
        occurrenceIds: [OCCURRENCE_IDS.first],
        treatmentIds: [TREATMENT_IDS.first],
        recordAnchorId: treatmentRecordAnchorId(OCCURRENCE_IDS.first),
      },
    ]);
  });

  test("ignores a wrong binding even when its display label names the right binding", () => {
    const event = observationEvent({
      series: [
        observationSeries({
          bindingId: "route_ridership_around_implementation_v1",
          metricId: "route_monthly_ridership",
          label: ROUTE_SPEED_OBSERVATION_BINDING_ID,
        }),
      ],
    });
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("dossier_fallback");
    expect(result.points).toEqual(DOSSIER_POINTS);
    expect(result.markers).toEqual([]);
  });

  test("admits available and partial series", () => {
    const available = observationEvent({
      eventId: "event-a",
      implementationMonth: "2024-01",
      series: [observationSeries({ values: [7.7, 7.8, 7.9] })],
    });
    const partial = observationEvent({
      eventId: "event-b",
      occurrenceId: OCCURRENCE_IDS.second,
      treatmentId: TREATMENT_IDS.second,
      implementationMonth: "2024-02",
      series: [observationSeries({ values: [7.7, null, 7.9] })],
    });
    const result = routeSpeedInterventionTrend(
      observationBundle([available, partial]),
      inventoryBundle([available, partial]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.focalEventId).toBe("event-b");
    expect(result.markers.map((marker) => marker.month)).toEqual(["2024-01", "2024-02"]);
  });

  test("excludes missing and all-null series", () => {
    const missing = observationEvent({
      eventId: "event-missing",
      series: [observationSeries({ values: [null, null, null] })],
    });
    const allNullPartial = observationEvent({
      eventId: "event-all-null-partial",
      series: [observationSeries({ values: [null, null, null], status: "partial" })],
    });
    const result = routeSpeedInterventionTrend(
      observationBundle([missing, allNullPartial]),
      inventoryBundle([missing, allNullPartial]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("dossier_fallback");
    expect(result.markers).toEqual([]);
  });

  test("selects fixed binding priority, latest month, then latest event ID without reading values", () => {
    const earlier = observationEvent({
      eventId: "event-z-earlier",
      implementationMonth: "2024-01",
      series: [observationSeries({ values: [100, 101, 102] })],
    });
    const tieA = observationEvent({
      eventId: "event-a",
      occurrenceId: OCCURRENCE_IDS.second,
      treatmentId: TREATMENT_IDS.second,
      implementationMonth: "2024-02",
      series: [observationSeries({ values: [-10, -9, -8] })],
    });
    const tieZ = observationEvent({
      eventId: "event-z",
      occurrenceId: OCCURRENCE_IDS.third,
      treatmentId: TREATMENT_IDS.third,
      implementationMonth: "2024-02",
      series: [observationSeries({ values: [1, 2, 3], presentationPriority: 99 })],
    });
    const events = [tieZ, earlier, tieA];
    const result = routeSpeedInterventionTrend(
      observationBundle(events),
      inventoryBundle(events),
      DOSSIER_POINTS,
      4,
    );

    expect(result.focalEventId).toBe("event-z");
    expect(result.points.map((point) => point.value)).toEqual([1, 2, 3]);
  });

  test("retains and orders explicit null points in the focal series", () => {
    const event = observationEvent({
      series: [observationSeries({ start: "2024-03", values: [8.4, null, 8.1, null] })],
      implementationMonth: "2024-04",
    });
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.points).toEqual([
      { month: "2024-03", value: 8.4 },
      { month: "2024-04", value: null },
      { month: "2024-05", value: 8.1 },
      { month: "2024-06", value: null },
    ]);
  });

  test("excludes eligible events outside the focal point months", () => {
    const outside = observationEvent({
      eventId: "event-outside",
      implementationMonth: "2023-12",
      series: [observationSeries({ start: "2023-11", values: [7, 7.1, 7.2] })],
    });
    const focal = observationEvent({
      eventId: "event-focal",
      occurrenceId: OCCURRENCE_IDS.second,
      treatmentId: TREATMENT_IDS.second,
      implementationMonth: "2024-02",
      series: [observationSeries({ start: "2024-01", values: [8, 8.1, 8.2] })],
    });
    const events = [outside, focal];
    const result = routeSpeedInterventionTrend(
      observationBundle(events),
      inventoryBundle(events),
      DOSSIER_POINTS,
      4,
    );

    expect(result.markers.map((marker) => marker.eventIds)).toEqual([["event-focal"]]);
  });

  test("clusters same-month events by distinct occurrence ID", () => {
    const first = observationEvent({
      eventId: "event-z",
      implementationMonth: "2024-02",
    });
    const second = observationEvent({
      eventId: "event-a",
      occurrenceId: OCCURRENCE_IDS.second,
      implementationMonth: "2024-02",
    });
    const events = [first, second];
    const result = routeSpeedInterventionTrend(
      observationBundle(events),
      inventoryBundle(events),
      DOSSIER_POINTS,
      4,
    );

    expect(result.markers).toEqual([
      {
        month: "2024-02",
        label: "2 enforcement starts, Feb 2024",
        count: 2,
        eventIds: ["event-a", "event-z"],
        occurrenceIds: [OCCURRENCE_IDS.first, OCCURRENCE_IDS.second],
        treatmentIds: [TREATMENT_IDS.first],
        recordAnchorId: treatmentRecordAnchorId(OCCURRENCE_IDS.first),
      },
    ]);
  });

  test("caps markers by retaining the most recent months in ascending order", () => {
    const events = [
      observationEvent({ eventId: "event-jan", implementationMonth: "2024-01" }),
      observationEvent({
        eventId: "event-feb",
        occurrenceId: OCCURRENCE_IDS.second,
        treatmentId: TREATMENT_IDS.second,
        implementationMonth: "2024-02",
      }),
      observationEvent({
        eventId: "event-mar",
        occurrenceId: OCCURRENCE_IDS.third,
        treatmentId: TREATMENT_IDS.third,
        implementationMonth: "2024-03",
      }),
    ];
    const result = routeSpeedInterventionTrend(
      observationBundle(events),
      inventoryBundle(events),
      DOSSIER_POINTS,
      2,
    );

    expect(result.markers.map((marker) => marker.month)).toEqual(["2024-02", "2024-03"]);
  });

  test("falls back when release identities differ", () => {
    const event = observationEvent();
    const observations = observationBundle([event], { publishedAt: "2026-07-21T12:00:00.000Z" });
    const result = routeSpeedInterventionTrend(
      observations,
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("dossier_fallback");
    expect(result.markers).toEqual([]);
    expect(result.limitations[0]).toBe("release");
  });

  test("falls back when exact route identities differ", () => {
    const event = observationEvent();
    const observations = observationBundle([event], { routeSlug: "b44" });
    const result = routeSpeedInterventionTrend(
      observations,
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("dossier_fallback");
    expect(result.markers).toEqual([]);
    expect(result.limitations[0]).toBe("route");
  });

  test("excludes a marker with a dangling occurrence ID", () => {
    const event = observationEvent();
    const inventory = inventoryBundle([event], { occurrences: [] });
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventory,
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("observation_bundle");
    expect(result.markers).toEqual([]);
    expect(result.limitations[0]).toContain("occurrence:");
  });

  test("requires the exact occurrence to reference the event treatment", () => {
    const event = observationEvent();
    const inventory = inventoryBundle([event]);
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      {
        ...inventory,
        occurrences: inventory.occurrences.map((occurrence) => ({
          ...occurrence,
          treatmentIds: [TREATMENT_IDS.second],
        })),
      },
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("observation_bundle");
    expect(result.markers).toEqual([]);
    expect(result.limitations[0]).toContain("occurrence:");
  });

  test("excludes a marker with a dangling treatment ID", () => {
    const event = observationEvent();
    const inventory = inventoryBundle([event], { treatments: [] });
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventory,
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("observation_bundle");
    expect(result.markers).toEqual([]);
    expect(result.limitations[0]).toContain("treatment:");
  });

  test("renders bus-lane and busway markers from their stable bindings", () => {
    const busLane = observationEvent({
      eventId: "event-lane",
      treatmentKind: "bus_lane",
    });
    const busway = observationEvent({
      eventId: "event-busway",
      occurrenceId: OCCURRENCE_IDS.second,
      treatmentId: TREATMENT_IDS.second,
      treatmentKind: "busway",
      implementationMonth: "2024-03",
    });
    const events = [busway, busLane];
    const result = routeSpeedInterventionTrend(
      observationBundle(events),
      inventoryBundle(events),
      DOSSIER_POINTS,
      4,
    );

    expect(result.source).toBe("observation_bundle");
    expect(result.focalEventId).toBe("event-busway");
    expect(result.markers.map((marker) => marker.label)).toEqual([
      "Bus lane starts Feb 2024",
      "Busway starts Mar 2024",
    ]);
  });

  test("labels narrower bus-lane scope as route context and exposes its method limitation", () => {
    const event = observationEvent({
      treatmentKind: "bus_lane",
      geographyScope: "corridor",
    });
    const result = routeSpeedInterventionTrend(
      observationBundle([event]),
      inventoryBundle([event]),
      DOSSIER_POINTS,
      4,
    );

    expect(result).toMatchObject({
      source: "observation_bundle",
      seriesLabel: "Route average speed (context)",
      methodLimitation: ROUTE_CONTEXT_METHOD_LIMITATION,
    });
    expect(result.markers[0]?.label).toBe("Bus lane starts Feb 2024");
  });

  test("keeps unsupported scope and project-only metadata on the zero-marker dossier fallback", () => {
    const unsupported = observationEvent({
      treatmentKind: "bus_lane",
      geographyScope: "source_only",
      series: [],
      resolutionStatus: "unsupported_scope",
    });
    const unsupportedResult = routeSpeedInterventionTrend(
      observationBundle([unsupported]),
      inventoryBundle([unsupported]),
      DOSSIER_POINTS,
      4,
    );
    expect(unsupportedResult).toMatchObject({
      source: "dossier_fallback",
      points: DOSSIER_POINTS,
      markers: [],
      methodLimitation: null,
    });

    const projectOnlyResult = routeSpeedInterventionTrend(
      observationBundle([]),
      inventoryBundle([], {
        projectRefs: [
          {
            projectId: "project:Busway starts 2024-02",
            treatmentIds: [],
            occurrenceIds: [],
            citationKeys: ["source#project"],
          },
        ],
      }),
      DOSSIER_POINTS,
      4,
    );
    expect(projectOnlyResult).toMatchObject({ source: "dossier_fallback", markers: [] });
  });

  test("keeps marker labels byte-identical when display copy and numeric values change", () => {
    const baseline = observationEvent({
      series: [observationSeries({ values: [7, null, 8] })],
    });
    const changed = observationEvent({
      program: "Completely different program copy",
      sourceId: "another_source",
      series: [
        observationSeries({
          label: "A different public-facing series name",
          unit: "different unit copy",
          values: [-500, null, 900],
        }),
      ],
    });
    const baselineLabels = JSON.stringify(
      routeSpeedInterventionTrend(
        observationBundle([baseline]),
        inventoryBundle([baseline]),
        DOSSIER_POINTS,
        4,
      ).markers.map((marker) => marker.label),
    );
    const changedLabels = JSON.stringify(
      routeSpeedInterventionTrend(
        observationBundle([changed]),
        inventoryBundle([changed]),
        DOSSIER_POINTS,
        4,
      ).markers.map((marker) => marker.label),
    );

    expect(changedLabels).toBe(baselineLabels);
  });
});
