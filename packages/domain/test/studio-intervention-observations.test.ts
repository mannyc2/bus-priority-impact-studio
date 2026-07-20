import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  StudioInterventionObservationIndexSchema,
  StudioInterventionObservationSeriesSchema,
  StudioRouteInterventionObservationBundleSchema,
} from "@bp/domain/studio/intervention-observations";
import {
  interventionObservationBundleKey,
  interventionObservationIndexKey,
} from "@bp/domain/studio/intervention-observations-key";

const treatmentId = "treatment:v1:aaaaaaaaaaaaaaaaaaaaaaaa";
const secondTreatmentId = "treatment:v1:bbbbbbbbbbbbbbbbbbbbbbbb";
const occurrenceId = "occurrence:v1:cccccccccccccccccccccccc";

const releaseIdentity = {
  releaseId: "pub_20260720T120000000Z",
  publishedAt: "2026-07-20T12:00:00.000Z",
  coverage: { start: "2023-04", end: "2026-06" },
};

const route = {
  routeId: "B44+",
  routeFamilyId: "B44",
  displayLabel: "B44-SBS",
  officialLongName: "Sheepshead Bay - Williamsburg",
  designationLiterals: ["route_type:SBS", "trip_type:14"],
  serviceModes: ["sbs"],
  routeTypes: ["SBS"],
  tripTypes: ["14"],
};

const inputRefs = [
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
];

function monthRange(start: string, count: number): string[] {
  const [startYear, startMonth] = start.split("-").map(Number) as [number, number];
  const startIndex = startYear * 12 + startMonth - 1;
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
  });
}

type SeriesOptions = {
  readonly bindingId?:
    | "route_speed_around_implementation_v1"
    | "route_ridership_around_implementation_v1"
    | "bus_lane_route_speed_around_implementation_v1"
    | "bus_lane_route_ridership_around_implementation_v1"
    | "busway_route_speed_around_implementation_v1"
    | "busway_route_ridership_around_implementation_v1";
  readonly metricId?: string;
  readonly role?: "primary_outcome" | "context";
  readonly scopeContext?: boolean;
  readonly nullIndexes?: readonly number[];
  readonly start?: string;
  readonly pointCount?: number;
};

function series(options: SeriesOptions = {}) {
  const months = monthRange(options.start ?? "2023-05", options.pointCount ?? 25);
  const nullIndexes = new Set(options.nullIndexes ?? [0, 12, 24]);
  const points = months.map((month, index) => ({
    month,
    value: nullIndexes.has(index) ? null : Number((8 + index / 10).toFixed(1)),
    sampleCount: nullIndexes.has(index) ? null : 20 + index,
  }));
  const observedMonths = points.flatMap((point) => (point.value === null ? [] : [point.month]));
  const status =
    observedMonths.length === 0
      ? "missing"
      : observedMonths.length === points.length
        ? "available"
        : "partial";
  const metricId = options.metricId ?? "route_average_speed_mph";
  const scopeLimitation =
    "Route-level observations are context for a treatment scoped below the full route.";
  return {
    bindingId: options.bindingId ?? "route_speed_around_implementation_v1",
    metricId,
    label: metricId === "route_monthly_ridership" ? "Monthly riders" : "Observed average speed",
    unit: metricId === "route_monthly_ridership" ? "riders" : "mph",
    role: options.role ?? "primary_outcome",
    grain: "month",
    dataProductId: "local_route_month_trends_history",
    resolverId: "sqlite.local_route_month_trend.history.v1",
    claimCeiling: "descriptive_observation",
    presentationPriority: metricId === "route_monthly_ridership" ? 2 : 1,
    status,
    coverage: {
      requestedStart: months[0],
      requestedEnd: months.at(-1),
      expectedPointCount: points.length,
      observedStart: observedMonths.at(0) ?? null,
      observedEnd: observedMonths.at(-1) ?? null,
      observedPointCount: observedMonths.length,
      nullPointCount: points.length - observedMonths.length,
    },
    points,
    limitations: [
      ...(options.scopeContext ? [scopeLimitation] : []),
      ...(status === "available"
        ? []
        : [
            `${observedMonths.length} of ${points.length} requested route-month values are published.`,
          ]),
    ],
  };
}

type EventOptions = {
  readonly eventId?: string;
  readonly treatmentId?: string;
  readonly treatmentKind?: "automated_bus_lane_enforcement" | "bus_lane" | "busway";
  readonly analysisFamily?: "automated_bus_lane_enforcement" | "bus_lane" | "busway" | null;
  readonly specId?:
    | "automated_bus_lane_enforcement_route_observations_v1"
    | "bus_lane_route_observations_v1"
    | "busway_route_observations_v1"
    | null;
  readonly program?: string | null;
  readonly resolutionStatus?:
    | "available"
    | "partial"
    | "missing"
    | "unsupported_treatment_family"
    | "unsupported_scope";
  readonly series?: readonly ReturnType<typeof series>[];
  readonly implementationDate?: string;
  readonly implementationMonth?: string;
  readonly datePrecision?: "day" | "month";
  readonly geographyScope?: "route" | "corridor" | "segment" | "intersection" | "source_only";
};

function event(options: EventOptions = {}) {
  const observationSeries = options.series ?? [series()];
  const analysisFamily =
    options.analysisFamily === undefined
      ? "automated_bus_lane_enforcement"
      : options.analysisFamily;
  const specId =
    options.specId === undefined
      ? analysisFamily === "automated_bus_lane_enforcement"
        ? "automated_bus_lane_enforcement_route_observations_v1"
        : analysisFamily === "bus_lane"
          ? "bus_lane_route_observations_v1"
          : analysisFamily === "busway"
            ? "busway_route_observations_v1"
            : null
      : options.specId;
  return {
    eventId: options.eventId ?? "observation:v1:b44-sbs:ace-1",
    occurrenceId,
    treatmentId: options.treatmentId ?? treatmentId,
    routeId: "B44+",
    treatmentKind: options.treatmentKind ?? "automated_bus_lane_enforcement",
    analysisFamily,
    specId,
    program: options.program === undefined ? "ABLE" : options.program,
    sourceId: "mta_ace_routes",
    implementationDate: options.implementationDate ?? "2024-05-01",
    implementationMonth: options.implementationMonth ?? "2024-05",
    datePrecision: options.datePrecision ?? "day",
    geographyScope: options.geographyScope ?? "route",
    resolutionStatus: options.resolutionStatus ?? observationSeries[0]?.status ?? "missing",
    series: observationSeries,
  };
}

function observedBounds(events: readonly ReturnType<typeof event>[]) {
  const months = events.flatMap((entry) =>
    entry.series.flatMap((entrySeries) =>
      entrySeries.points.flatMap((point) => (point.value === null ? [] : [point.month])),
    ),
  );
  months.sort();
  return { start: months.at(0) ?? null, end: months.at(-1) ?? null, grain: "month" };
}

function bundle(events: readonly ReturnType<typeof event>[] = [event()]) {
  return {
    artifactKind: "bp.studio.route_intervention_observations.v1",
    schemaVersion: 1,
    ...releaseIdentity,
    route,
    routeId: "B44+",
    routeSlug: "b44-sbs",
    dataCoverage: observedBounds(events),
    inputRefs,
    events,
    limitations: [],
  };
}

function indexEvent(entry = event()) {
  return {
    eventId: entry.eventId,
    occurrenceId: entry.occurrenceId,
    treatmentId: entry.treatmentId,
    routeId: entry.routeId,
    routeSlug: "b44-sbs",
    treatmentKind: entry.treatmentKind,
    analysisFamily: entry.analysisFamily,
    specId: entry.specId,
    program: entry.program,
    sourceId: entry.sourceId,
    implementationDate: entry.implementationDate,
    implementationMonth: entry.implementationMonth,
    datePrecision: entry.datePrecision,
    geographyScope: entry.geographyScope,
    resolutionStatus: entry.resolutionStatus,
    availableMetricIds: entry.series
      .filter((entrySeries) => entrySeries.status !== "missing")
      .map((entrySeries) => entrySeries.metricId)
      .sort(),
    bundleKey: "studio/v2/routes/b44-sbs/intervention-observations.json",
  };
}

function index(events = [indexEvent()], dataCoverage = observedBounds([event()])) {
  return {
    artifactKind: "bp.studio.intervention_observation_index.v1",
    schemaVersion: 1,
    ...releaseIdentity,
    dataCoverage,
    inputRefs,
    events,
  };
}

describe("Studio intervention observation contract", () => {
  test("exposes stable route-bundle and compact-index keys", () => {
    expect(interventionObservationBundleKey("b44-sbs")).toBe(
      "studio/v2/routes/b44-sbs/intervention-observations.json",
    );
    expect(interventionObservationIndexKey()).toBe(
      "studio/v2/interventions/observation-index.json",
    );
  });

  test("strictly round-trips a 25-month bundle and compact index", () => {
    const decodedBundle = decodeStrict(StudioRouteInterventionObservationBundleSchema)(bundle());
    const decodedIndex = decodeStrict(StudioInterventionObservationIndexSchema)(index());

    expect(decodedBundle.events[0]?.series[0]?.points).toHaveLength(25);
    expect(decodedBundle.events[0]?.series[0]?.points[0]?.value).toBeNull();
    expect(decodedBundle.events[0]?.series[0]?.points[1]?.value).not.toBeNull();
    expect(decodedBundle.inputRefs as unknown).toEqual(inputRefs);
    expect(decodedIndex.inputRefs as unknown).toEqual(inputRefs);
    expect(decodedIndex.events[0]?.bundleKey).toBe(
      "studio/v2/routes/b44-sbs/intervention-observations.json",
    );
    expect(decodedBundle.events[0]).toMatchObject({
      treatmentKind: "automated_bus_lane_enforcement",
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
      datePrecision: "day",
      geographyScope: "route",
    });
  });

  test("strictly decodes bus-lane and busway route-context contracts", () => {
    const busLane = event({
      eventId: "observation:v1:b44-sbs:bus-lane",
      treatmentKind: "bus_lane",
      analysisFamily: "bus_lane",
      series: [
        series({ bindingId: "bus_lane_route_speed_around_implementation_v1" }),
        series({
          bindingId: "bus_lane_route_ridership_around_implementation_v1",
          metricId: "route_monthly_ridership",
          role: "context",
        }),
      ],
    });
    const decodedBusLane = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([busLane]),
    );
    expect(decodedBusLane.events[0]).toMatchObject({
      treatmentKind: "bus_lane",
      analysisFamily: "bus_lane",
      specId: "bus_lane_route_observations_v1",
      geographyScope: "route",
    });

    const busway = event({
      eventId: "observation:v1:b44-sbs:busway",
      treatmentKind: "busway",
      analysisFamily: "busway",
      program: null,
      implementationDate: "2024-06",
      implementationMonth: "2024-06",
      datePrecision: "month",
      geographyScope: "corridor",
      series: [
        series({
          bindingId: "busway_route_speed_around_implementation_v1",
          role: "context",
          scopeContext: true,
        }),
        series({
          bindingId: "busway_route_ridership_around_implementation_v1",
          metricId: "route_monthly_ridership",
          role: "context",
          scopeContext: true,
        }),
      ],
    });
    const decodedBusway = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([busway]),
    );
    const decodedBuswayIndex = decodeStrict(StudioInterventionObservationIndexSchema)(
      index([indexEvent(busway)], observedBounds([busway])),
    );
    expect(decodedBusway.events[0]).toMatchObject({
      analysisFamily: "busway",
      specId: "busway_route_observations_v1",
      program: null,
      implementationDate: "2024-06",
      datePrecision: "month",
      geographyScope: "corridor",
    });
    expect(decodedBusway.events[0]?.series.map((entry) => entry.role)).toEqual([
      "context",
      "context",
    ]);
    expect(decodedBuswayIndex.events[0]).toMatchObject({
      analysisFamily: "busway",
      specId: "busway_route_observations_v1",
      program: null,
      datePrecision: "month",
      geographyScope: "corridor",
    });
  });

  test("preserves reviewed identity for legacy unsupported-scope events", () => {
    const scopeRejected = event({
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
      geographyScope: "corridor",
      resolutionStatus: "unsupported_scope",
      series: [],
    });
    const decodedBundle = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([scopeRejected]),
    );
    const decodedIndex = decodeStrict(StudioInterventionObservationIndexSchema)(
      index([indexEvent(scopeRejected)], { start: null, end: null, grain: "month" }),
    );
    expect(decodedBundle.events[0]).toMatchObject({
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
      resolutionStatus: "unsupported_scope",
      series: [],
    });
    expect(decodedIndex.events[0]).toMatchObject({
      analysisFamily: "automated_bus_lane_enforcement",
      specId: "automated_bus_lane_enforcement_route_observations_v1",
      resolutionStatus: "unsupported_scope",
      availableMetricIds: [],
    });
  });

  test("accepts one occurrence fanned out to two uniquely keyed treatments", () => {
    const first = event({
      eventId: "observation:v1:b44-sbs:ace-a",
      treatmentId,
    });
    const second = event({
      eventId: "observation:v1:b44-sbs:ace-b",
      treatmentId: secondTreatmentId,
    });
    const decoded = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([first, second]),
    );

    expect(decoded.events.map((entry) => entry.occurrenceId)).toEqual([occurrenceId, occurrenceId]);
    expect(decoded.events.map((entry) => entry.treatmentId)).toEqual([
      treatmentId,
      secondTreatmentId,
    ]);
  });

  test("enforces coverage arithmetic, ordered unique months, and observed bounds", () => {
    const valid = series();
    expect(decodeStrict(StudioInterventionObservationSeriesSchema)(valid).status).toBe("partial");

    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)({
        ...valid,
        coverage: { ...valid.coverage, nullPointCount: valid.coverage.nullPointCount + 1 },
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)({
        ...valid,
        points: [valid.points[1], valid.points[0], ...valid.points.slice(2)],
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)({
        ...valid,
        coverage: { ...valid.coverage, observedStart: "2023-07" },
      }),
    ).toThrow();
  });

  test("enforces available, partial, and missing status semantics", () => {
    const available = series({ nullIndexes: [] });
    const partial = series({ nullIndexes: [5] });
    const missing = series({ nullIndexes: Array.from({ length: 25 }, (_, index) => index) });

    expect(decodeStrict(StudioInterventionObservationSeriesSchema)(available).status).toBe(
      "available",
    );
    expect(decodeStrict(StudioInterventionObservationSeriesSchema)(partial).status).toBe("partial");
    expect(decodeStrict(StudioInterventionObservationSeriesSchema)(missing).status).toBe("missing");
    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)({ ...partial, status: "available" }),
    ).toThrow();
  });

  test("derives mixed and all-null bundle coverage honestly", () => {
    const early = series({ start: "2022-01", pointCount: 3, nullIndexes: [0] });
    const late = series({
      bindingId: "route_ridership_around_implementation_v1",
      metricId: "route_monthly_ridership",
      role: "context",
      start: "2025-01",
      pointCount: 3,
      nullIndexes: [2],
    });
    const mixedEvent = event({ resolutionStatus: "partial", series: [early, late] });
    const mixed = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([mixedEvent]),
    );
    expect(mixed.dataCoverage as unknown).toEqual({
      start: "2022-02",
      end: "2025-02",
      grain: "month",
    });

    const noData = series({
      nullIndexes: Array.from({ length: 25 }, (_, pointIndex) => pointIndex),
    });
    const allNullEvent = event({ resolutionStatus: "missing", series: [noData] });
    const allNull = decodeStrict(StudioRouteInterventionObservationBundleSchema)(
      bundle([allNullEvent]),
    );
    expect(allNull.dataCoverage).toEqual({ start: null, end: null, grain: "month" });
    expect(
      decodeStrict(StudioInterventionObservationIndexSchema)(
        index([indexEvent(allNullEvent)], { start: null, end: null, grain: "month" }),
      ).dataCoverage,
    ).toEqual({ start: null, end: null, grain: "month" });
  });

  test("accepts index coverage spanning differently covered route bundles", () => {
    const early = event({
      eventId: "observation:v1:b44-sbs:early",
      series: [series({ start: "2021-01", pointCount: 3, nullIndexes: [0] })],
    });
    const late = event({
      eventId: "observation:v1:q27:late",
      treatmentId: secondTreatmentId,
      series: [series({ start: "2025-01", pointCount: 3, nullIndexes: [2] })],
    });
    const lateIndexEvent = {
      ...indexEvent(late),
      routeId: "Q27",
      routeSlug: "q27",
      bundleKey: "studio/v2/routes/q27/intervention-observations.json",
    };
    const decoded = decodeStrict(StudioInterventionObservationIndexSchema)(
      index([indexEvent(early), lateIndexEvent], {
        start: "2021-02",
        end: "2025-02",
        grain: "month",
      }),
    );
    expect(decoded.dataCoverage as unknown).toEqual({
      start: "2021-02",
      end: "2025-02",
      grain: "month",
    });
  });

  test("requires the exact two input refs in their prescribed order", () => {
    const invalidRefs = [
      [inputRefs[0]],
      [inputRefs[0], inputRefs[0]],
      [inputRefs[1], inputRefs[0]],
      [{ ...inputRefs[0], dataProductId: "wrong" }, inputRefs[1]],
      [{ ...inputRefs[0], role: "observation_source" }, inputRefs[1]],
      [inputRefs[0], { ...inputRefs[1], featureGrain: "wrong" }],
      [inputRefs[0], { ...inputRefs[1], resolverId: "wrong" }],
      [inputRefs[0], inputRefs[1], inputRefs[1]],
    ];

    for (const refs of invalidRefs) {
      expect(() =>
        decodeStrict(StudioRouteInterventionObservationBundleSchema)({
          ...bundle(),
          inputRefs: refs,
        }),
      ).toThrow();
      expect(() =>
        decodeStrict(StudioInterventionObservationIndexSchema)({ ...index(), inputRefs: refs }),
      ).toThrow();
    }
  });

  test("rejects duplicate event and composite identities", () => {
    const first = event();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(bundle([first, first])),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioInterventionObservationIndexSchema)(
        index([indexEvent(first), { ...indexEvent(first), eventId: "different" }]),
      ),
    ).toThrow();
  });

  test("rejects mismatched treatment, analysis-family, and spec identities", () => {
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([event({ analysisFamily: null })]),
      ),
    ).toThrow();

    const unsupported = event({
      treatmentKind: "bus_lane",
      analysisFamily: "automated_bus_lane_enforcement",
      resolutionStatus: "unsupported_treatment_family",
      series: [],
    });
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(bundle([unsupported])),
    ).toThrow();

    const busLane = event({
      treatmentKind: "bus_lane",
      analysisFamily: "bus_lane",
      series: [series({ bindingId: "bus_lane_route_speed_around_implementation_v1" })],
    });
    const invalidEvents: readonly ReturnType<typeof event>[] = [
      { ...busLane, treatmentKind: "busway" },
      { ...busLane, analysisFamily: "busway" },
      { ...busLane, specId: "busway_route_observations_v1" },
    ];
    for (const invalidEvent of invalidEvents) {
      expect(() =>
        decodeStrict(StudioRouteInterventionObservationBundleSchema)(bundle([invalidEvent])),
      ).toThrow();
      expect(() =>
        decodeStrict(StudioInterventionObservationIndexSchema)(
          index([indexEvent(invalidEvent as ReturnType<typeof event>)]),
        ),
      ).toThrow();
    }
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([
          {
            ...busLane,
            series: [series({ bindingId: "route_speed_around_implementation_v1" })],
          },
        ]),
      ),
    ).toThrow();
  });

  test("requires date precision and route-context semantics to match", () => {
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([event({ implementationDate: "2024-05", datePrecision: "day" })]),
      ),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([event({ implementationDate: "2024-05-01", datePrecision: "month" })]),
      ),
    ).toThrow();

    const corridorLane = {
      treatmentKind: "bus_lane" as const,
      analysisFamily: "bus_lane" as const,
      geographyScope: "corridor" as const,
    };
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([
          event({
            ...corridorLane,
            series: [
              series({
                bindingId: "bus_lane_route_speed_around_implementation_v1",
                role: "context",
              }),
            ],
          }),
        ]),
      ),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([
          event({
            treatmentKind: "bus_lane",
            analysisFamily: "bus_lane",
            geographyScope: "source_only",
            series: [series({ bindingId: "bus_lane_route_speed_around_implementation_v1" })],
          }),
        ]),
      ),
    ).toThrow();
  });

  test("rejects malformed dates, mismatched routes, and invalid coverage grain", () => {
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)(
        bundle([event({ implementationDate: "2024-02-30", implementationMonth: "2024-02" })]),
      ),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)({ ...bundle(), routeId: "B44" }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)({
        ...bundle(),
        dataCoverage: { ...bundle().dataCoverage, grain: "day" },
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioInterventionObservationIndexSchema)({
        ...index(),
        dataCoverage: { ...index().dataCoverage, grain: "day" },
      }),
    ).toThrow();
  });

  test("rejects arrays beyond their public bounds", () => {
    const sixtyTwoPointSeries = series({ pointCount: 62, nullIndexes: [] });
    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)(sixtyTwoPointSeries),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioInterventionObservationSeriesSchema)({
        ...series(),
        limitations: Array.from({ length: 13 }, (_, index) => `limitation-${index}`),
      }),
    ).toThrow();
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)({
        ...bundle(),
        events: Array.from({ length: 101 }, (_, indexValue) =>
          event({
            eventId: `observation:v1:b44-sbs:${indexValue.toString().padStart(3, "0")}`,
            treatmentId: `treatment:v1:${indexValue.toString(16).padStart(24, "0")}`,
          }),
        ),
      }),
    ).toThrow();
  });

  test("keeps effect summaries outside every serialized event and series", () => {
    const decoded = decodeStrict(StudioRouteInterventionObservationBundleSchema)(bundle());
    const serialized = JSON.stringify(decoded);
    for (const forbiddenKey of [
      "beforeMean",
      "afterMean",
      "delta",
      "percentChange",
      "effectEstimate",
      "direction",
      "verdict",
    ]) {
      expect(serialized).not.toContain(`"${forbiddenKey}"`);
    }
    expect(() =>
      decodeStrict(StudioRouteInterventionObservationBundleSchema)({
        ...bundle(),
        events: [{ ...event(), effectEstimate: 1.2 }],
      }),
    ).toThrow();
  });
});
