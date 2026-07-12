import { Schema } from "effect";
import { CoercedNumberSchema, decodeSchemaPreserve, decodeSchemaStrict } from "../schema-decode.js";

export const EXPRESS_ROUTE_ANALYSIS_SCHEMA_VERSION = 1;
export const EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD = "2023-04-2023-09";
export const EXPRESS_ROUTE_HIGH_LOAD_THRESHOLD = 0.7;
export const EXPRESS_ROUTE_SLOW_SPEED_MPH_THRESHOLD = 8;
export const EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD = 10;

export type ExpressCapacityDirection = "NB" | "SB" | "EB" | "WB";
export type ExpressSpeedDirection = "N" | "S" | "E" | "W";
export type ExpressDayType = "Weekday" | "Weekend";
export type ExpressLoadBand = "lower" | "moderate" | "high" | "very_high";
export type ExpressSpeedBand = "slow" | "moderate" | "faster";

export type ExpressBusCapacitySourceRow = {
  routeId: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  weekStartDate: string;
  tripsWithApc: number;
  loadPercentage: number;
};

export type ExpressBusCapacityRouteHourSummary = {
  routeId: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  weekCount: number;
  totalTripsWithApc: number;
  weightedLoadPercentage: number | null;
  peakLoadPercentage: number;
  lowSample: boolean;
};

export type ExpressBusCapacityContextArtifact = {
  schemaVersion: 1;
  sourceId: "mta_express_bus_capacity_2023";
  period: typeof EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD;
  generatedAt: string;
  caveats: string[];
  rows: ExpressBusCapacityRouteHourSummary[];
};

export type ExpressRouteCapacityWindow = ExpressBusCapacityRouteHourSummary & {
  isoMonth: string;
};

export type ExpressRouteSpeedSourceRow = {
  route_id: string;
  year: string | number;
  month: string | number;
  direction: ExpressSpeedDirection;
  day_of_week: string;
  hour_of_day: string | number;
  observation_count: string | number;
  bus_trip_count: string | number;
  average_speed_mph: string | number;
};

export type ExpressRouteSpeedWindow = {
  routeId: string;
  isoMonth: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  observationCount: number;
  busTripCount: number;
  averageSpeedMph: number | null;
};

export type ExpressRouteJoinedWindow = {
  routeId: string;
  isoMonth: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  capacity: {
    weekCount: number;
    totalTripsWithApc: number;
    weightedLoadPercentage: number | null;
    peakLoadPercentage: number;
    lowSample: boolean;
  };
  speed: {
    observationCount: number;
    busTripCount: number;
    averageSpeedMph: number | null;
  } | null;
  screening: {
    loadBand: ExpressLoadBand;
    speedBand: ExpressSpeedBand | null;
    highLoadSlowSpeedCandidate: boolean;
  };
};

export type ExpressRouteSummary = {
  routeId: string;
  windowCount: number;
  matchedSpeedWindowCount: number;
  highLoadWindowCount: number;
  highLoadSlowSpeedCandidateCount: number;
  maxWeightedLoadPercentage: number | null;
  minAverageSpeedMph: number | null;
  topCandidate: ExpressRouteJoinedWindow | null;
};

export type ExpressRouteAnalysisArtifact = typeof ExpressRouteAnalysisArtifactSchema.Type;

export type ExpressRouteAnalysisAuditIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ExpressRouteAnalysisAuditArtifact = {
  schemaVersion: 1;
  generatedAt: string;
  inputPath: string;
  status: "pass" | "warn" | "fail";
  errorCount: number;
  warningCount: number;
  routeCount: number;
  windowCount: number;
  matchedSpeedWindowCount: number;
  speedMatchShare: number;
  candidateWindowCount: number;
  issues: ExpressRouteAnalysisAuditIssue[];
};

const ExpressCapacityDirectionSchema = Schema.Literals(["NB", "SB", "EB", "WB"]);
const ExpressDayTypeSchema = Schema.Literals(["Weekday", "Weekend"]);
const ExpressLoadBandSchema = Schema.Literals(["lower", "moderate", "high", "very_high"]);
const ExpressSpeedBandSchema = Schema.Literals(["slow", "moderate", "faster"]);

const ExpressRouteAnalysisCapacitySchema = Schema.Struct({
  weekCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  totalTripsWithApc: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  weightedLoadPercentage: Schema.NullOr(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
  ),
  peakLoadPercentage: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
    Schema.isLessThanOrEqualTo(1),
  ),
  lowSample: Schema.Boolean,
});

const ExpressRouteAnalysisSpeedSchema = Schema.Struct({
  observationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  busTripCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  averageSpeedMph: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
});

const ExpressRouteAnalysisScreeningSchema = Schema.Struct({
  loadBand: ExpressLoadBandSchema,
  speedBand: Schema.NullOr(ExpressSpeedBandSchema),
  highLoadSlowSpeedCandidate: Schema.Boolean,
});

export const ExpressRouteAnalysisWindowSchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  isoMonth: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/)),
  direction: ExpressCapacityDirectionSchema,
  dayType: ExpressDayTypeSchema,
  hourOfDay: Schema.Number.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .check(Schema.isLessThanOrEqualTo(23)),
  capacity: ExpressRouteAnalysisCapacitySchema,
  speed: Schema.NullOr(ExpressRouteAnalysisSpeedSchema),
  screening: ExpressRouteAnalysisScreeningSchema,
});

export const ExpressRouteAnalysisRouteSummarySchema = Schema.Struct({
  routeId: Schema.String.check(Schema.isMinLength(1)),
  windowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  matchedSpeedWindowCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  highLoadWindowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  highLoadSlowSpeedCandidateCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  maxWeightedLoadPercentage: Schema.NullOr(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(Schema.isLessThanOrEqualTo(1)),
  ),
  minAverageSpeedMph: Schema.NullOr(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  topCandidate: Schema.NullOr(ExpressRouteAnalysisWindowSchema),
});

export const ExpressRouteAnalysisArtifactSchema = Schema.Struct({
  schemaVersion: Schema.Literal(EXPRESS_ROUTE_ANALYSIS_SCHEMA_VERSION),
  generatedAt: Schema.String.check(Schema.isMinLength(1)),
  sourceIds: Schema.Tuple([
    Schema.Literal("mta_express_bus_capacity_2023"),
    Schema.Literal("bus_segment_speeds_2023_2024"),
  ]),
  period: Schema.Literal(EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD),
  thresholds: Schema.Struct({
    highLoadThreshold: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(1),
    ),
    slowSpeedMphThreshold: Schema.Number.check(Schema.isGreaterThan(0)),
    lowSampleTripThreshold: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  }),
  caveats: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
  routeSummaries: Schema.Array(ExpressRouteAnalysisRouteSummarySchema),
  rows: Schema.Array(ExpressRouteAnalysisWindowSchema),
});

const RawSpeedWindowSchema = Schema.Struct({
  route_id: Schema.String.check(Schema.isMinLength(1)),
  year: CoercedNumberSchema.check(Schema.isInt()),
  month: CoercedNumberSchema.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(12)),
  direction: Schema.Literals(["N", "S", "E", "W"]),
  day_of_week: Schema.String.check(Schema.isMinLength(1)),
  hour_of_day: CoercedNumberSchema.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .check(Schema.isLessThanOrEqualTo(23)),
  observation_count: CoercedNumberSchema.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  bus_trip_count: CoercedNumberSchema.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  average_speed_mph: CoercedNumberSchema.check(Schema.isGreaterThanOrEqualTo(0)),
});

function groupKey(row: {
  routeId: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
}): string {
  return [row.routeId, row.direction, row.dayType, row.hourOfDay].join("|");
}

function capacityKey(input: {
  routeId: string;
  isoMonth: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
}): string {
  return [input.routeId, input.isoMonth, input.direction, input.dayType, input.hourOfDay].join("|");
}

function weekMonth(value: string): string {
  const [year, month] = value.split("-");
  if (year === undefined || month === undefined) {
    throw new Error(`Invalid week start date: ${value}`);
  }
  return `${year}-${month}`;
}

function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function expressLoadBand(value: number | null): ExpressLoadBand {
  if (value === null) return "lower";
  if (value >= 0.85) return "very_high";
  if (value >= EXPRESS_ROUTE_HIGH_LOAD_THRESHOLD) return "high";
  if (value >= 0.5) return "moderate";
  return "lower";
}

export function expressSpeedBand(value: number | null): ExpressSpeedBand | null {
  if (value === null) return null;
  if (value < EXPRESS_ROUTE_SLOW_SPEED_MPH_THRESHOLD) return "slow";
  if (value < 12) return "moderate";
  return "faster";
}

function speedDirectionToCapacityDirection(value: ExpressSpeedDirection): ExpressCapacityDirection {
  if (value === "N") return "NB";
  if (value === "S") return "SB";
  if (value === "E") return "EB";
  return "WB";
}

function dayOfWeekToDayType(value: string): ExpressDayType | null {
  if (["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].includes(value)) {
    return "Weekday";
  }
  if (["Saturday", "Sunday"].includes(value)) {
    return "Weekend";
  }
  return null;
}

export function summarizeExpressBusCapacityRows(
  rows: readonly ExpressBusCapacitySourceRow[],
): ExpressBusCapacityRouteHourSummary[] {
  const groups = new Map<
    string,
    {
      first: ExpressBusCapacitySourceRow;
      weeks: Set<string>;
      trips: number;
      weightedLoad: number;
      peakLoadPercentage: number;
    }
  >();

  for (const row of rows) {
    const key = groupKey(row);
    const current = groups.get(key) ?? {
      first: row,
      weeks: new Set<string>(),
      trips: 0,
      weightedLoad: 0,
      peakLoadPercentage: row.loadPercentage,
    };

    current.weeks.add(row.weekStartDate);
    current.trips += row.tripsWithApc;
    current.weightedLoad += row.loadPercentage * row.tripsWithApc;
    current.peakLoadPercentage = Math.max(current.peakLoadPercentage, row.loadPercentage);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      routeId: group.first.routeId,
      direction: group.first.direction,
      dayType: group.first.dayType,
      hourOfDay: group.first.hourOfDay,
      weekCount: group.weeks.size,
      totalTripsWithApc: group.trips,
      weightedLoadPercentage:
        group.trips === 0 ? null : roundMetric(group.weightedLoad / group.trips),
      peakLoadPercentage: roundMetric(group.peakLoadPercentage),
      lowSample: group.trips < EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD,
    }))
    .sort(
      (a, b) =>
        a.routeId.localeCompare(b.routeId) ||
        a.direction.localeCompare(b.direction) ||
        a.dayType.localeCompare(b.dayType) ||
        a.hourOfDay - b.hourOfDay,
    );
}

export function buildExpressBusCapacityContextArtifact(input: {
  rows: readonly ExpressBusCapacitySourceRow[];
  generatedAt: string;
}): ExpressBusCapacityContextArtifact {
  return {
    schemaVersion: EXPRESS_ROUTE_ANALYSIS_SCHEMA_VERSION,
    sourceId: "mta_express_bus_capacity_2023",
    period: EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD,
    generatedAt: input.generatedAt,
    caveats: [
      "Express bus routes only.",
      "Load is measured at each route's maximum load point.",
      "Rows do not identify stop boardings, alightings, local/SBS loads, or M15 SBS passenger load.",
      "Low-sample summaries have fewer than 10 APC trips across the grouped weeks.",
    ],
    rows: summarizeExpressBusCapacityRows(input.rows),
  };
}

export function summarizeExpressRouteCapacityRows(
  rows: readonly ExpressBusCapacitySourceRow[],
): ExpressRouteCapacityWindow[] {
  const groups = new Map<
    string,
    {
      first: ExpressBusCapacitySourceRow;
      isoMonth: string;
      weeks: Set<string>;
      trips: number;
      weightedLoad: number;
      peakLoadPercentage: number;
    }
  >();

  for (const row of rows) {
    const month = weekMonth(row.weekStartDate);
    const key = capacityKey({ ...row, isoMonth: month });
    const current = groups.get(key) ?? {
      first: row,
      isoMonth: month,
      weeks: new Set<string>(),
      trips: 0,
      weightedLoad: 0,
      peakLoadPercentage: row.loadPercentage,
    };

    current.weeks.add(row.weekStartDate);
    current.trips += row.tripsWithApc;
    current.weightedLoad += row.loadPercentage * row.tripsWithApc;
    current.peakLoadPercentage = Math.max(current.peakLoadPercentage, row.loadPercentage);
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => ({
    routeId: group.first.routeId,
    isoMonth: group.isoMonth,
    direction: group.first.direction,
    dayType: group.first.dayType,
    hourOfDay: group.first.hourOfDay,
    weekCount: group.weeks.size,
    totalTripsWithApc: group.trips,
    weightedLoadPercentage:
      group.trips === 0 ? null : roundMetric(group.weightedLoad / group.trips),
    peakLoadPercentage: roundMetric(group.peakLoadPercentage),
    lowSample: group.trips < EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD,
  }));
}

export function summarizeExpressRouteSpeedRows(
  rows: readonly unknown[],
): ExpressRouteSpeedWindow[] {
  const groups = new Map<
    string,
    {
      routeId: string;
      isoMonth: string;
      direction: ExpressCapacityDirection;
      dayType: ExpressDayType;
      hourOfDay: number;
      observationCount: number;
      busTripCount: number;
      weightedSpeed: number;
      speedWeight: number;
    }
  >();

  for (const row of rows) {
    const parsed = decodeSchemaPreserve(RawSpeedWindowSchema, row);
    const dayType = dayOfWeekToDayType(parsed.day_of_week);
    if (dayType === null) continue;

    const routeId = parsed.route_id;
    const month = isoMonth(parsed.year, parsed.month);
    const direction = speedDirectionToCapacityDirection(parsed.direction);
    const key = capacityKey({
      routeId,
      isoMonth: month,
      direction,
      dayType,
      hourOfDay: parsed.hour_of_day,
    });
    const current = groups.get(key) ?? {
      routeId,
      isoMonth: month,
      direction,
      dayType,
      hourOfDay: parsed.hour_of_day,
      observationCount: 0,
      busTripCount: 0,
      weightedSpeed: 0,
      speedWeight: 0,
    };
    const weight = parsed.bus_trip_count > 0 ? parsed.bus_trip_count : parsed.observation_count;

    current.observationCount += parsed.observation_count;
    current.busTripCount += parsed.bus_trip_count;
    current.weightedSpeed += parsed.average_speed_mph * weight;
    current.speedWeight += weight;
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => ({
    routeId: group.routeId,
    isoMonth: group.isoMonth,
    direction: group.direction,
    dayType: group.dayType,
    hourOfDay: group.hourOfDay,
    observationCount: group.observationCount,
    busTripCount: group.busTripCount,
    averageSpeedMph:
      group.speedWeight === 0 ? null : roundMetric(group.weightedSpeed / group.speedWeight),
  }));
}

export function joinExpressRouteWindows(input: {
  capacityRows: readonly ExpressRouteCapacityWindow[];
  speedRows: readonly ExpressRouteSpeedWindow[];
}): ExpressRouteJoinedWindow[] {
  const speedByKey = new Map(input.speedRows.map((row) => [capacityKey(row), row]));

  return input.capacityRows
    .map((capacity) => {
      const speed = speedByKey.get(capacityKey(capacity)) ?? null;
      const load = expressLoadBand(capacity.weightedLoadPercentage);
      const speedSignal = expressSpeedBand(speed?.averageSpeedMph ?? null);
      const highLoadSlowSpeedCandidate =
        !capacity.lowSample && (load === "high" || load === "very_high") && speedSignal === "slow";

      return {
        routeId: capacity.routeId,
        isoMonth: capacity.isoMonth,
        direction: capacity.direction,
        dayType: capacity.dayType,
        hourOfDay: capacity.hourOfDay,
        capacity: {
          weekCount: capacity.weekCount,
          totalTripsWithApc: capacity.totalTripsWithApc,
          weightedLoadPercentage: capacity.weightedLoadPercentage,
          peakLoadPercentage: capacity.peakLoadPercentage,
          lowSample: capacity.lowSample,
        },
        speed:
          speed === null
            ? null
            : {
                observationCount: speed.observationCount,
                busTripCount: speed.busTripCount,
                averageSpeedMph: speed.averageSpeedMph,
              },
        screening: {
          loadBand: load,
          speedBand: speedSignal,
          highLoadSlowSpeedCandidate,
        },
      } satisfies ExpressRouteJoinedWindow;
    })
    .sort(
      (left, right) =>
        left.routeId.localeCompare(right.routeId) ||
        left.isoMonth.localeCompare(right.isoMonth) ||
        left.direction.localeCompare(right.direction) ||
        left.dayType.localeCompare(right.dayType) ||
        left.hourOfDay - right.hourOfDay,
    );
}

function candidateSort(left: ExpressRouteJoinedWindow, right: ExpressRouteJoinedWindow): number {
  return (
    (right.capacity.weightedLoadPercentage ?? 0) - (left.capacity.weightedLoadPercentage ?? 0) ||
    (left.speed?.averageSpeedMph ?? Number.POSITIVE_INFINITY) -
      (right.speed?.averageSpeedMph ?? Number.POSITIVE_INFINITY)
  );
}

export function summarizeExpressRouteAnalysisRows(
  rows: readonly ExpressRouteJoinedWindow[],
): ExpressRouteSummary[] {
  const byRoute = new Map<string, ExpressRouteJoinedWindow[]>();
  for (const row of rows) {
    byRoute.set(row.routeId, [...(byRoute.get(row.routeId) ?? []), row]);
  }

  return [...byRoute.entries()]
    .map(([routeId, routeRows]) => {
      const matchedRows = routeRows.filter((row) => row.speed !== null);
      const highLoadRows = routeRows.filter(
        (row) => row.screening.loadBand === "high" || row.screening.loadBand === "very_high",
      );
      const candidates = routeRows
        .filter((row) => row.screening.highLoadSlowSpeedCandidate)
        .sort(candidateSort);
      const loadValues = routeRows
        .map((row) => row.capacity.weightedLoadPercentage)
        .filter((value): value is number => value !== null);
      const speedValues = matchedRows
        .map((row) => row.speed?.averageSpeedMph)
        .filter((value): value is number => value !== undefined && value !== null);

      return {
        routeId,
        windowCount: routeRows.length,
        matchedSpeedWindowCount: matchedRows.length,
        highLoadWindowCount: highLoadRows.length,
        highLoadSlowSpeedCandidateCount: candidates.length,
        maxWeightedLoadPercentage:
          loadValues.length === 0 ? null : roundMetric(Math.max(...loadValues)),
        minAverageSpeedMph: speedValues.length === 0 ? null : roundMetric(Math.min(...speedValues)),
        topCandidate: candidates[0] ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.highLoadSlowSpeedCandidateCount - left.highLoadSlowSpeedCandidateCount ||
        (right.maxWeightedLoadPercentage ?? 0) - (left.maxWeightedLoadPercentage ?? 0) ||
        left.routeId.localeCompare(right.routeId),
    );
}

export function buildExpressRouteAnalysisArtifact(input: {
  capacityRows: readonly ExpressBusCapacitySourceRow[];
  speedRows: readonly unknown[];
  generatedAt: string;
}): ExpressRouteAnalysisArtifact {
  const capacityWindows = summarizeExpressRouteCapacityRows(input.capacityRows);
  const speedWindows = summarizeExpressRouteSpeedRows(input.speedRows);
  const rows = joinExpressRouteWindows({ capacityRows: capacityWindows, speedRows: speedWindows });
  const routeSummaries = summarizeExpressRouteAnalysisRows(rows);

  return decodeSchemaStrict(ExpressRouteAnalysisArtifactSchema, {
    schemaVersion: EXPRESS_ROUTE_ANALYSIS_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    sourceIds: ["mta_express_bus_capacity_2023", "bus_segment_speeds_2023_2024"],
    period: EXPRESS_ROUTE_ANALYSIS_STATIC_PERIOD,
    thresholds: {
      highLoadThreshold: EXPRESS_ROUTE_HIGH_LOAD_THRESHOLD,
      slowSpeedMphThreshold: EXPRESS_ROUTE_SLOW_SPEED_MPH_THRESHOLD,
      lowSampleTripThreshold: EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD,
    },
    caveats: [
      "Screening context only; not a causal claim.",
      "Capacity data is express-only and measured at each route's maximum load point.",
      "Capacity rows do not identify stop boardings, alightings, local/SBS loads, or M15 SBS passenger load.",
      "Speed is joined at route, month, direction, day-type, and hour grain; it is not stop-level load or segment-level APC truth.",
    ],
    routeSummaries,
    rows,
  });
}

function expectedCandidate(row: ExpressRouteJoinedWindow): boolean {
  return (
    !row.capacity.lowSample &&
    (row.screening.loadBand === "high" || row.screening.loadBand === "very_high") &&
    row.screening.speedBand === "slow"
  );
}

function addIssue(
  issues: ExpressRouteAnalysisAuditIssue[],
  severity: ExpressRouteAnalysisAuditIssue["severity"],
  code: string,
  message: string,
): void {
  issues.push({ severity, code, message });
}

function nearEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= 0.0001;
}

function requiredCaveatMissing(caveats: readonly string[], fragment: string): boolean {
  return !caveats.some((caveat) => caveat.toLowerCase().includes(fragment.toLowerCase()));
}

export function auditExpressRouteAnalysisArtifact(
  artifact: ExpressRouteAnalysisArtifact,
): ExpressRouteAnalysisAuditIssue[] {
  const issues: ExpressRouteAnalysisAuditIssue[] = [];
  const thresholds = artifact.thresholds;

  if (thresholds.highLoadThreshold !== EXPRESS_ROUTE_HIGH_LOAD_THRESHOLD) {
    addIssue(
      issues,
      "error",
      "threshold_high_load_changed",
      `Expected highLoadThreshold=${EXPRESS_ROUTE_HIGH_LOAD_THRESHOLD}, found ${thresholds.highLoadThreshold}.`,
    );
  }
  if (thresholds.slowSpeedMphThreshold !== EXPRESS_ROUTE_SLOW_SPEED_MPH_THRESHOLD) {
    addIssue(
      issues,
      "error",
      "threshold_slow_speed_changed",
      `Expected slowSpeedMphThreshold=${EXPRESS_ROUTE_SLOW_SPEED_MPH_THRESHOLD}, found ${thresholds.slowSpeedMphThreshold}.`,
    );
  }
  if (thresholds.lowSampleTripThreshold !== EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD) {
    addIssue(
      issues,
      "error",
      "threshold_low_sample_changed",
      `Expected lowSampleTripThreshold=${EXPRESS_ROUTE_LOW_SAMPLE_TRIP_THRESHOLD}, found ${thresholds.lowSampleTripThreshold}.`,
    );
  }

  for (const fragment of [
    "not a causal claim",
    "maximum load point",
    "stop boardings",
    "route, month",
  ]) {
    if (requiredCaveatMissing(artifact.caveats, fragment)) {
      addIssue(
        issues,
        "error",
        "required_caveat_missing",
        `Missing express-route analysis caveat containing: ${fragment}.`,
      );
    }
  }

  const matchedSpeedWindowCount = artifact.rows.filter((row) => row.speed !== null).length;
  const matchShare =
    artifact.rows.length === 0 ? 1 : matchedSpeedWindowCount / artifact.rows.length;
  if (matchShare < 0.9) {
    addIssue(
      issues,
      "warning",
      "speed_match_share_low",
      `Only ${roundMetric(matchShare * 100)}% of capacity windows have speed matches.`,
    );
  }

  for (const row of artifact.rows) {
    const expected = expectedCandidate(row);
    if (row.screening.highLoadSlowSpeedCandidate !== expected) {
      addIssue(
        issues,
        "error",
        "candidate_flag_mismatch",
        `${row.routeId} ${row.isoMonth} ${row.direction} ${row.dayType} ${row.hourOfDay}: expected candidate=${expected}.`,
      );
    }
    if (row.screening.highLoadSlowSpeedCandidate) {
      if (row.capacity.totalTripsWithApc < thresholds.lowSampleTripThreshold) {
        addIssue(
          issues,
          "error",
          "candidate_low_sample",
          `${row.routeId} candidate has only ${row.capacity.totalTripsWithApc} APC trips.`,
        );
      }
      if ((row.capacity.weightedLoadPercentage ?? 0) < thresholds.highLoadThreshold) {
        addIssue(
          issues,
          "error",
          "candidate_below_load_threshold",
          `${row.routeId} candidate has weighted load ${row.capacity.weightedLoadPercentage}.`,
        );
      }
      if (row.speed === null || row.speed.averageSpeedMph === null) {
        addIssue(
          issues,
          "error",
          "candidate_missing_speed",
          `${row.routeId} candidate has no matched speed value.`,
        );
      } else if (row.speed.averageSpeedMph >= thresholds.slowSpeedMphThreshold) {
        addIssue(
          issues,
          "error",
          "candidate_above_speed_threshold",
          `${row.routeId} candidate speed is ${row.speed.averageSpeedMph} mph.`,
        );
      }
    }
  }

  const expectedSummaries = summarizeExpressRouteAnalysisRows(artifact.rows);
  if (expectedSummaries.length !== artifact.routeSummaries.length) {
    addIssue(
      issues,
      "error",
      "route_summary_count_mismatch",
      `Expected ${expectedSummaries.length} route summaries, found ${artifact.routeSummaries.length}.`,
    );
  }

  const summariesByRoute = new Map(
    artifact.routeSummaries.map((summary) => [summary.routeId, summary]),
  );
  for (const expected of expectedSummaries) {
    const actual = summariesByRoute.get(expected.routeId);
    if (actual === undefined) {
      addIssue(
        issues,
        "error",
        "route_summary_missing",
        `Missing route summary for ${expected.routeId}.`,
      );
      continue;
    }

    if (
      actual.windowCount !== expected.windowCount ||
      actual.matchedSpeedWindowCount !== expected.matchedSpeedWindowCount ||
      actual.highLoadWindowCount !== expected.highLoadWindowCount ||
      actual.highLoadSlowSpeedCandidateCount !== expected.highLoadSlowSpeedCandidateCount ||
      !nearEqual(actual.maxWeightedLoadPercentage, expected.maxWeightedLoadPercentage) ||
      !nearEqual(actual.minAverageSpeedMph, expected.minAverageSpeedMph)
    ) {
      addIssue(
        issues,
        "error",
        "route_summary_metric_mismatch",
        `Route summary metrics do not match row-level data for ${expected.routeId}.`,
      );
    }

    const expectedTop = expected.topCandidate;
    const actualTop = actual.topCandidate;
    if ((expectedTop === null) !== (actualTop === null)) {
      addIssue(
        issues,
        "error",
        "route_summary_top_candidate_mismatch",
        `Route summary top candidate presence does not match row-level data for ${expected.routeId}.`,
      );
    } else if (
      expectedTop !== null &&
      actualTop !== null &&
      capacityKey(expectedTop) !== capacityKey(actualTop)
    ) {
      addIssue(
        issues,
        "error",
        "route_summary_top_candidate_mismatch",
        `Route summary top candidate window does not match row-level data for ${expected.routeId}.`,
      );
    }
  }

  return issues;
}

export function buildExpressRouteAnalysisAuditArtifact(input: {
  artifact: ExpressRouteAnalysisArtifact;
  inputPath: string;
  generatedAt: string;
}): ExpressRouteAnalysisAuditArtifact {
  const issues = auditExpressRouteAnalysisArtifact(input.artifact);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const matchedSpeedWindowCount = input.artifact.rows.filter((row) => row.speed !== null).length;
  const candidateWindowCount = input.artifact.rows.filter(
    (row) => row.screening.highLoadSlowSpeedCandidate,
  ).length;

  return {
    schemaVersion: EXPRESS_ROUTE_ANALYSIS_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    inputPath: input.inputPath,
    status: errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
    errorCount,
    warningCount,
    routeCount: input.artifact.routeSummaries.length,
    windowCount: input.artifact.rows.length,
    matchedSpeedWindowCount,
    speedMatchShare:
      input.artifact.rows.length === 0
        ? 1
        : roundMetric(matchedSpeedWindowCount / input.artifact.rows.length),
    candidateWindowCount,
    issues,
  };
}
