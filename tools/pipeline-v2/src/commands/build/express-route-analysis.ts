import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type NormalizedExpressBusCapacity,
  NormalizedExpressBusCapacitySchema,
} from "@bp/sources/adapters/mta/express-bus-capacity";
import { soqlIn } from "@bp/sources/clients/socrata/soql";
import { getSocrataSource, type SocrataManifestSource } from "@bp/sources/registry";
import { loadSourceManifestYaml } from "@bp/sources/registry/loaders/bun-yaml";
import { defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { fromRepoRoot } from "../../lib/paths.ts";
import {
  fetchSoda3RowsForSource,
  type SocrataFetch,
  type SocrataRow,
  type Soda3SoqlQuery,
} from "../../lib/soda3.ts";
import { defaultExpressBusCapacityNormalizedPath } from "../ingest/express-bus-capacity.ts";

const schemaVersion = 1;
const staticPeriod = "2023-04-2023-09";
const highLoadThreshold = 0.7;
const slowSpeedMphThreshold = 8;
const lowSampleTripThreshold = 10;

export type BuildExpressRouteAnalysisArgs = {
  inputPath?: string;
  outputPath?: string;
  routes?: string[];
  generatedAt?: Date;
  fetcher?: SocrataFetch;
  manifestText?: string;
};

type CapacityWindow = {
  routeId: string;
  isoMonth: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  weekCount: number;
  totalTripsWithApc: number;
  weightedLoadPercentage: number | null;
  peakLoadPercentage: number;
  lowSample: boolean;
};

type SpeedWindow = {
  routeId: string;
  isoMonth: string;
  direction: ExpressCapacityDirection;
  dayType: ExpressDayType;
  hourOfDay: number;
  observationCount: number;
  busTripCount: number;
  averageSpeedMph: number | null;
};

type JoinedWindow = {
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
    loadBand: LoadBand;
    speedBand: SpeedBand | null;
    highLoadSlowSpeedCandidate: boolean;
  };
};

type RouteSummary = {
  routeId: string;
  windowCount: number;
  matchedSpeedWindowCount: number;
  highLoadWindowCount: number;
  highLoadSlowSpeedCandidateCount: number;
  maxWeightedLoadPercentage: number | null;
  minAverageSpeedMph: number | null;
  topCandidate: JoinedWindow | null;
};

export type BuildExpressRouteAnalysisResult = {
  outputPath: string;
  routeCount: number;
  windowCount: number;
  matchedSpeedWindowCount: number;
  candidateWindowCount: number;
};

export type AuditExpressRouteAnalysisArgs = {
  inputPath?: string;
  outputPath?: string;
  generatedAt?: Date;
};

type AuditIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

type ExpressCapacityDirection = "NB" | "SB" | "EB" | "WB";
type ExpressSpeedDirection = "N" | "S" | "E" | "W";
type ExpressDayType = "Weekday" | "Weekend";
type LoadBand = "lower" | "moderate" | "high" | "very_high";
type SpeedBand = "slow" | "moderate" | "faster";

const ExpressCapacityDirectionSchema = z.enum(["NB", "SB", "EB", "WB"]);
const ExpressDayTypeSchema = z.enum(["Weekday", "Weekend"]);
const LoadBandSchema = z.enum(["lower", "moderate", "high", "very_high"]);
const SpeedBandSchema = z.enum(["slow", "moderate", "faster"]);

const ExpressRouteAnalysisCapacitySchema = z
  .object({
    weekCount: z.number().int().nonnegative(),
    totalTripsWithApc: z.number().int().nonnegative(),
    weightedLoadPercentage: z.number().min(0).max(1).nullable(),
    peakLoadPercentage: z.number().min(0).max(1),
    lowSample: z.boolean(),
  })
  .strict();

const ExpressRouteAnalysisSpeedSchema = z
  .object({
    observationCount: z.number().int().nonnegative(),
    busTripCount: z.number().int().nonnegative(),
    averageSpeedMph: z.number().nonnegative().nullable(),
  })
  .strict();

const ExpressRouteAnalysisScreeningSchema = z
  .object({
    loadBand: LoadBandSchema,
    speedBand: SpeedBandSchema.nullable(),
    highLoadSlowSpeedCandidate: z.boolean(),
  })
  .strict();

export const ExpressRouteAnalysisWindowSchema = z
  .object({
    routeId: z.string().min(1),
    isoMonth: z.string().regex(/^\d{4}-\d{2}$/),
    direction: ExpressCapacityDirectionSchema,
    dayType: ExpressDayTypeSchema,
    hourOfDay: z.number().int().min(0).max(23),
    capacity: ExpressRouteAnalysisCapacitySchema,
    speed: ExpressRouteAnalysisSpeedSchema.nullable(),
    screening: ExpressRouteAnalysisScreeningSchema,
  })
  .strict();

export const ExpressRouteAnalysisRouteSummarySchema = z
  .object({
    routeId: z.string().min(1),
    windowCount: z.number().int().nonnegative(),
    matchedSpeedWindowCount: z.number().int().nonnegative(),
    highLoadWindowCount: z.number().int().nonnegative(),
    highLoadSlowSpeedCandidateCount: z.number().int().nonnegative(),
    maxWeightedLoadPercentage: z.number().min(0).max(1).nullable(),
    minAverageSpeedMph: z.number().nonnegative().nullable(),
    topCandidate: ExpressRouteAnalysisWindowSchema.nullable(),
  })
  .strict();

export const ExpressRouteAnalysisArtifactSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    generatedAt: z.string().min(1),
    sourceIds: z.tuple([
      z.literal("mta_express_bus_capacity_2023"),
      z.literal("bus_segment_speeds_2023_2024"),
    ]),
    period: z.literal(staticPeriod),
    thresholds: z
      .object({
        highLoadThreshold: z.number().min(0).max(1),
        slowSpeedMphThreshold: z.number().positive(),
        lowSampleTripThreshold: z.number().int().positive(),
      })
      .strict(),
    caveats: z.array(z.string().min(1)).min(1),
    routeSummaries: z.array(ExpressRouteAnalysisRouteSummarySchema),
    rows: z.array(ExpressRouteAnalysisWindowSchema),
  })
  .strict();

export type ExpressRouteAnalysisArtifact = z.output<typeof ExpressRouteAnalysisArtifactSchema>;

const NormalizedRowsArtifactSchema = z
  .object({
    rows: z.array(NormalizedExpressBusCapacitySchema),
  })
  .passthrough();

const RawSpeedWindowSchema = z
  .object({
    route_id: z.string().min(1),
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    direction: z.enum(["N", "S", "E", "W"]),
    day_of_week: z.string().min(1),
    hour_of_day: z.coerce.number().int().min(0).max(23),
    observation_count: z.coerce.number().int().nonnegative(),
    bus_trip_count: z.coerce.number().int().nonnegative(),
    average_speed_mph: z.coerce.number().nonnegative(),
  })
  .passthrough();

const defaultOutputPath = () =>
  fromRepoRoot(
    join("data/artifacts/express-route-analysis", `load-speed-context-${staticPeriod}.json`),
  );

const defaultAuditOutputPath = () =>
  fromRepoRoot(join("data/artifacts/express-route-analysis", `audit-${staticPeriod}.json`));

function weekMonth(value: string): string {
  const [year, month] = value.split("-");
  if (year === undefined || month === undefined) {
    throw new Error(`Invalid week start date: ${value}`);
  }
  return `${year}-${month}`;
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

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function loadBand(value: number | null): LoadBand {
  if (value === null) return "lower";
  if (value >= 0.85) return "very_high";
  if (value >= highLoadThreshold) return "high";
  if (value >= 0.5) return "moderate";
  return "lower";
}

function speedBand(value: number | null): SpeedBand | null {
  if (value === null) return null;
  if (value < slowSpeedMphThreshold) return "slow";
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

function summarizeCapacityRows(rows: NormalizedExpressBusCapacity[]): CapacityWindow[] {
  const groups = new Map<
    string,
    {
      first: NormalizedExpressBusCapacity;
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
    lowSample: group.trips < lowSampleTripThreshold,
  }));
}

function summarizeSpeedRows(rows: SocrataRow[]): SpeedWindow[] {
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
    const parsed = RawSpeedWindowSchema.parse(row);
    const dayType = dayOfWeekToDayType(parsed.day_of_week);
    if (dayType === null) {
      continue;
    }
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

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchSpeedRows(input: {
  source: SocrataManifestSource;
  routeIds: string[];
  months: string[];
  fetcher?: SocrataFetch;
}): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  const routeChunks = chunkArray(input.routeIds, 25);

  for (const month of input.months) {
    const [yearText, monthText] = month.split("-");
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
      throw new Error(`Invalid ISO month: ${month}`);
    }

    for (const routeChunk of routeChunks) {
      const query: Soda3SoqlQuery = {
        select:
          "route_id,year,month,direction,day_of_week,hour_of_day,count(*) as observation_count,sum(bus_trip_count) as bus_trip_count,avg(average_road_speed) as average_speed_mph",
        where: [
          `year = ${year}`,
          `month = ${monthNumber}`,
          "route_type = 'Express'",
          soqlIn("route_id", routeChunk),
        ].join(" AND "),
        group: "route_id,year,month,direction,day_of_week,hour_of_day",
        order: "route_id,year,month,direction,day_of_week,hour_of_day",
      };
      rows.push(
        ...(await fetchSoda3RowsForSource(input.source, query, {
          fetcher: input.fetcher,
          pageSize: 50_000,
        })),
      );
    }
  }

  return rows;
}

function joinWindows(capacityRows: CapacityWindow[], speedRows: SpeedWindow[]): JoinedWindow[] {
  const speedByKey = new Map(speedRows.map((row) => [capacityKey(row), row]));

  return capacityRows
    .map((capacity) => {
      const speed = speedByKey.get(capacityKey(capacity)) ?? null;
      const load = loadBand(capacity.weightedLoadPercentage);
      const speedSignal = speedBand(speed?.averageSpeedMph ?? null);
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
      } satisfies JoinedWindow;
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

function routeSummaries(rows: JoinedWindow[]): RouteSummary[] {
  const byRoute = new Map<string, JoinedWindow[]>();
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

function candidateSort(left: JoinedWindow, right: JoinedWindow): number {
  return (
    (right.capacity.weightedLoadPercentage ?? 0) - (left.capacity.weightedLoadPercentage ?? 0) ||
    (left.speed?.averageSpeedMph ?? Number.POSITIVE_INFINITY) -
      (right.speed?.averageSpeedMph ?? Number.POSITIVE_INFINITY)
  );
}

function expectedCandidate(row: JoinedWindow): boolean {
  return (
    !row.capacity.lowSample &&
    (row.screening.loadBand === "high" || row.screening.loadBand === "very_high") &&
    row.screening.speedBand === "slow"
  );
}

function addIssue(
  issues: AuditIssue[],
  severity: AuditIssue["severity"],
  code: string,
  message: string,
): void {
  issues.push({ severity, code, message });
}

function nearEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= 0.0001;
}

function requiredCaveatMissing(caveats: string[], fragment: string): boolean {
  return !caveats.some((caveat) => caveat.toLowerCase().includes(fragment.toLowerCase()));
}

function auditArtifact(artifact: ExpressRouteAnalysisArtifact): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const thresholds = artifact.thresholds;

  if (thresholds.highLoadThreshold !== highLoadThreshold) {
    addIssue(
      issues,
      "error",
      "threshold_high_load_changed",
      `Expected highLoadThreshold=${highLoadThreshold}, found ${thresholds.highLoadThreshold}.`,
    );
  }
  if (thresholds.slowSpeedMphThreshold !== slowSpeedMphThreshold) {
    addIssue(
      issues,
      "error",
      "threshold_slow_speed_changed",
      `Expected slowSpeedMphThreshold=${slowSpeedMphThreshold}, found ${thresholds.slowSpeedMphThreshold}.`,
    );
  }
  if (thresholds.lowSampleTripThreshold !== lowSampleTripThreshold) {
    addIssue(
      issues,
      "error",
      "threshold_low_sample_changed",
      `Expected lowSampleTripThreshold=${lowSampleTripThreshold}, found ${thresholds.lowSampleTripThreshold}.`,
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

  const expectedSummaries = routeSummaries(artifact.rows);
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

async function readManifest(args: BuildExpressRouteAnalysisArgs): Promise<string> {
  return (
    args.manifestText ?? (await Bun.file(fromRepoRoot("knowledge/raw/source_manifest.yaml")).text())
  );
}

export async function buildExpressRouteAnalysis(
  args: BuildExpressRouteAnalysisArgs = {},
): Promise<BuildExpressRouteAnalysisResult> {
  const inputPath = args.inputPath ?? defaultExpressBusCapacityNormalizedPath();
  const outputPath = args.outputPath ?? defaultOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const routeFilter = args.routes === undefined ? null : new Set(args.routes);
  const input = NormalizedRowsArtifactSchema.parse(await Bun.file(inputPath).json());
  const capacityInputRows =
    routeFilter === null ? input.rows : input.rows.filter((row) => routeFilter.has(row.routeId));
  const capacityRows = summarizeCapacityRows(capacityInputRows);
  const routeIds = [...new Set(capacityRows.map((row) => row.routeId))].sort();
  const months = [...new Set(capacityRows.map((row) => row.isoMonth))].sort();
  const manifest = loadSourceManifestYaml(await readManifest(args));
  const speedSource = getSocrataSource(manifest, "bus_segment_speeds_2023_2024");
  const rawSpeedRows =
    routeIds.length === 0
      ? []
      : await fetchSpeedRows({
          source: speedSource,
          routeIds,
          months,
          ...(args.fetcher === undefined ? {} : { fetcher: args.fetcher }),
        });
  const speedRows = summarizeSpeedRows(rawSpeedRows);
  const rows = joinWindows(capacityRows, speedRows);
  const summaries = routeSummaries(rows);

  await mkdir(dirname(outputPath), { recursive: true });
  const artifact = ExpressRouteAnalysisArtifactSchema.parse({
    schemaVersion,
    generatedAt: generatedAt.toISOString(),
    sourceIds: ["mta_express_bus_capacity_2023", "bus_segment_speeds_2023_2024"],
    period: staticPeriod,
    thresholds: {
      highLoadThreshold,
      slowSpeedMphThreshold,
      lowSampleTripThreshold,
    },
    caveats: [
      "Screening context only; not a causal claim.",
      "Capacity data is express-only and measured at each route's maximum load point.",
      "Capacity rows do not identify stop boardings, alightings, local/SBS loads, or M15 SBS passenger load.",
      "Speed is joined at route, month, direction, day-type, and hour grain; it is not stop-level load or segment-level APC truth.",
    ],
    routeSummaries: summaries,
    rows,
  });
  await writeJson(outputPath, artifact);

  return {
    outputPath,
    routeCount: routeIds.length,
    windowCount: rows.length,
    matchedSpeedWindowCount: rows.filter((row) => row.speed !== null).length,
    candidateWindowCount: rows.filter((row) => row.screening.highLoadSlowSpeedCandidate).length,
  };
}

export async function auditExpressRouteAnalysis(args: AuditExpressRouteAnalysisArgs = {}) {
  const inputPath = args.inputPath ?? defaultOutputPath();
  const outputPath = args.outputPath ?? defaultAuditOutputPath();
  const generatedAt = args.generatedAt ?? new Date();
  const artifact = ExpressRouteAnalysisArtifactSchema.parse(await Bun.file(inputPath).json());
  const issues = auditArtifact(artifact);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const matchedSpeedWindowCount = artifact.rows.filter((row) => row.speed !== null).length;
  const candidateWindowCount = artifact.rows.filter(
    (row) => row.screening.highLoadSlowSpeedCandidate,
  ).length;
  const result = {
    schemaVersion,
    generatedAt: generatedAt.toISOString(),
    inputPath,
    status: errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
    errorCount,
    warningCount,
    routeCount: artifact.routeSummaries.length,
    windowCount: artifact.rows.length,
    matchedSpeedWindowCount,
    speedMatchShare:
      artifact.rows.length === 0 ? 1 : roundMetric(matchedSpeedWindowCount / artifact.rows.length),
    candidateWindowCount,
    issues,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, result);

  if (errorCount > 0) {
    throw new Error(`Express route analysis audit failed with ${errorCount} error(s).`);
  }

  return result;
}

export default defineCommand({
  path: ["build", "express-route-analysis"],
  summary:
    "Join express capacity and segment speed rows into a screening-grade load/speed context artifact.",
  input: {
    options: z.object({
      input: z.string().optional().describe("Path to normalized rows artifact"),
      output: z.string().optional().describe("Output path for the artifact"),
      routes: z.string().optional().describe("Comma-separated route ids to include"),
    }),
  },
  output: z.object({
    outputPath: z.string(),
    routeCount: z.number(),
    windowCount: z.number(),
    matchedSpeedWindowCount: z.number(),
    candidateWindowCount: z.number(),
  }),
  async run({ input }) {
    const routes =
      input.options.routes === undefined
        ? undefined
        : input.options.routes
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    return buildExpressRouteAnalysis({
      ...(input.options.input === undefined ? {} : { inputPath: input.options.input }),
      ...(input.options.output === undefined ? {} : { outputPath: input.options.output }),
      ...(routes === undefined ? {} : { routes }),
    });
  },
});
