import { asc, desc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import {
  routeArtifact,
  routeBriefSummary,
  routeCatalog,
  routeCatalogType,
  routeMonthTrend,
  routeReadiness,
  routeSpeedHistoryCoverage,
} from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteCatalogIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    route_short_name: z.string().min(1),
    route_long_name: z.string().nullable(),
    shape_count: z.number().int().nonnegative(),
    stop_count: z.number().int().nonnegative(),
    timepoint_stop_count: z.number().int().nonnegative(),
  })
  .strip();

const RouteCatalogTypeIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    type_rank: z.number().int().positive(),
    route_type: z.string().min(1),
  })
  .strip();

const RouteReadinessIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    readiness_status: z.string().min(1),
    build_eligible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    readiness_score: z.number().int().min(0).max(100),
    speed_observation_count: z.number().int().nonnegative(),
    speed_bus_trip_count: z.number().int().nonnegative(),
    average_speed_mph: z.number().nonnegative().nullable(),
    schedule_timepoint_count: z.number().int().nonnegative(),
    shape_count: z.number().int().nonnegative(),
    stop_count: z.number().int().nonnegative(),
    timepoint_stop_count: z.number().int().nonnegative(),
  })
  .strip();

const RouteBriefSummaryIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    public_visible: z.union([z.literal(0), z.literal(1), z.boolean()]),
    route_score: z.number().int().min(0).max(100),
    average_speed_mph: z.number().nonnegative(),
    hotspot_count: z.number().int().nonnegative(),
    total_ridership: z.number().nonnegative(),
    ace_active: z.union([z.literal(0), z.literal(1), z.boolean()]),
    bus_lane_matched_lane_count: z.number().int().nonnegative(),
  })
  .strip();

const RouteArtifactIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    artifact_name: z.string().min(1),
  })
  .strip();

const RouteMonthTrendIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    average_speed_mph: z.number().nonnegative().nullable(),
    ridership: z.number().nonnegative().nullable(),
    has_speed_trend: z.union([z.literal(0), z.literal(1), z.boolean()]),
    has_ridership_trend: z.union([z.literal(0), z.literal(1), z.boolean()]),
  })
  .strip();

const RouteSpeedHistoryCoverageIndexRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    route_slug: z.string().min(1),
    history_start_month: IsoMonthSchema,
    history_end_month: IsoMonthSchema,
    artifact_path: z.string().min(1),
    artifact_status: z.string().min(1),
    month_count: z.number().int().nonnegative(),
    segment_count: z.number().int().nonnegative(),
    cell_count: z.number().int().nonnegative(),
    available_cell_count: z.number().int().nonnegative(),
    missing_cell_count: z.number().int().nonnegative(),
  })
  .strip();

type RouteCatalogTypeIndexRow = z.output<typeof RouteCatalogTypeIndexRowSchema>;
type RouteReadinessIndexRow = z.output<typeof RouteReadinessIndexRowSchema>;
type RouteBriefSummaryIndexRow = z.output<typeof RouteBriefSummaryIndexRowSchema>;
type RouteArtifactIndexRow = z.output<typeof RouteArtifactIndexRowSchema>;
type RouteMonthTrendIndexRow = z.output<typeof RouteMonthTrendIndexRowSchema>;
type RouteSpeedHistoryCoverageIndexRow = z.output<typeof RouteSpeedHistoryCoverageIndexRowSchema>;

function isMissingRouteSpeedHistoryCoverageTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("no such table") &&
    error.message.includes("route_speed_history_coverage")
  );
}

export type StudioRouteIndexSourceRow = {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  routeTypes: string[];
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
  readiness: {
    status: string;
    buildEligible: boolean;
    score: number;
    speedObservationCount: number;
    speedBusTripCount: number;
    averageSpeedMph: number | null;
    scheduleTimepointCount: number;
    shapeCount: number;
    stopCount: number;
    timepointStopCount: number;
  } | null;
  summary: {
    publicVisible: boolean;
    routeScore: number;
    averageSpeedMph: number;
    hotspotCount: number;
    totalRidership: number;
    aceActive: boolean;
    busLaneMatchedLaneCount: number;
  } | null;
  artifactNames: string[];
  historyCoverage: {
    startMonth: string | null;
    endMonth: string | null;
    pointCount: number;
    speedMonthCount: number;
    ridershipMonthCount: number;
  };
  historyStats: {
    firstSpeedMonth: string | null;
    firstAverageSpeedMph: number | null;
    latestSpeedMonth: string | null;
    latestAverageSpeedMph: number | null;
    speedChangeMph: number | null;
    firstRidershipMonth: string | null;
    firstRidership: number | null;
    latestRidershipMonth: string | null;
    latestRidership: number | null;
    ridershipChange: number | null;
    /** §16-D3 trend baseline: % speed change vs exactly 6/12 months before the latest speed month. */
    speedMovement6mPct: number | null;
    speedMovement12mPct: number | null;
  };
  speedHistoryCoverage: {
    routeSlug: string;
    startMonth: string;
    endMonth: string;
    artifactPath: string;
    artifactStatus: string;
    monthCount: number;
    segmentCount: number;
    cellCount: number;
    availableCellCount: number;
    missingCellCount: number;
  } | null;
};

function bool(value: boolean | 0 | 1): boolean {
  return value === true || value === 1;
}

function groupRouteTypes(rows: readonly RouteCatalogTypeIndexRow[]): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const row of rows) {
    const group = output.get(row.route_id) ?? [];
    group.push(row.route_type);
    output.set(row.route_id, group);
  }
  return output;
}

function groupArtifactNames(rows: readonly RouteArtifactIndexRow[]): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const row of rows) {
    const group = output.get(row.route_id) ?? [];
    group.push(row.artifact_name);
    output.set(row.route_id, group);
  }
  return output;
}

function groupHistoryCoverage(rows: readonly RouteMonthTrendIndexRow[]) {
  const output = new Map<
    string,
    {
      coverage: StudioRouteIndexSourceRow["historyCoverage"];
      stats: StudioRouteIndexSourceRow["historyStats"];
    }
  >();
  const speedsByRoute = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (bool(row.has_speed_trend) && row.average_speed_mph !== null) {
      const speeds = speedsByRoute.get(row.route_id) ?? new Map<string, number>();
      speeds.set(row.month, row.average_speed_mph);
      speedsByRoute.set(row.route_id, speeds);
    }
    const group = output.get(row.route_id) ?? {
      coverage: {
        startMonth: null,
        endMonth: null,
        pointCount: 0,
        speedMonthCount: 0,
        ridershipMonthCount: 0,
      },
      stats: {
        firstSpeedMonth: null,
        firstAverageSpeedMph: null,
        latestSpeedMonth: null,
        latestAverageSpeedMph: null,
        speedChangeMph: null,
        firstRidershipMonth: null,
        firstRidership: null,
        latestRidershipMonth: null,
        latestRidership: null,
        ridershipChange: null,
        speedMovement6mPct: null,
        speedMovement12mPct: null,
      },
    };
    group.coverage.startMonth =
      group.coverage.startMonth === null || row.month < group.coverage.startMonth
        ? row.month
        : group.coverage.startMonth;
    group.coverage.endMonth =
      group.coverage.endMonth === null || row.month > group.coverage.endMonth
        ? row.month
        : group.coverage.endMonth;
    group.coverage.pointCount += 1;
    if (bool(row.has_speed_trend) && row.average_speed_mph !== null) {
      group.coverage.speedMonthCount += 1;
      if (group.stats.firstSpeedMonth === null || row.month < group.stats.firstSpeedMonth) {
        group.stats.firstSpeedMonth = row.month;
        group.stats.firstAverageSpeedMph = row.average_speed_mph;
      }
      if (group.stats.latestSpeedMonth === null || row.month > group.stats.latestSpeedMonth) {
        group.stats.latestSpeedMonth = row.month;
        group.stats.latestAverageSpeedMph = row.average_speed_mph;
      }
    }
    if (bool(row.has_ridership_trend) && row.ridership !== null) {
      group.coverage.ridershipMonthCount += 1;
      if (group.stats.firstRidershipMonth === null || row.month < group.stats.firstRidershipMonth) {
        group.stats.firstRidershipMonth = row.month;
        group.stats.firstRidership = row.ridership;
      }
      if (
        group.stats.latestRidershipMonth === null ||
        row.month > group.stats.latestRidershipMonth
      ) {
        group.stats.latestRidershipMonth = row.month;
        group.stats.latestRidership = row.ridership;
      }
    }
    if (group.stats.firstAverageSpeedMph !== null && group.stats.latestAverageSpeedMph !== null) {
      group.stats.speedChangeMph =
        group.stats.latestAverageSpeedMph - group.stats.firstAverageSpeedMph;
    }
    if (group.stats.firstRidership !== null && group.stats.latestRidership !== null) {
      group.stats.ridershipChange = group.stats.latestRidership - group.stats.firstRidership;
    }
    output.set(row.route_id, group);
  }
  for (const [routeId, group] of output) {
    const speeds = speedsByRoute.get(routeId);
    const latestMonth = group.stats.latestSpeedMonth;
    const latest = group.stats.latestAverageSpeedMph;
    if (speeds === undefined || latestMonth === null || latest === null) continue;
    group.stats.speedMovement6mPct = movementPct(latest, speeds.get(monthsBefore(latestMonth, 6)));
    group.stats.speedMovement12mPct = movementPct(
      latest,
      speeds.get(monthsBefore(latestMonth, 12)),
    );
  }
  return output;
}

/** `YYYY-MM` minus `count` months; empty string (never a key) when the input is malformed. */
function monthsBefore(month: string, count: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (match === null) return "";
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) - count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function movementPct(latest: number, prior: number | undefined): number | null {
  if (prior === undefined || prior === 0) return null;
  return ((latest - prior) / prior) * 100;
}

function groupSpeedHistoryCoverage(rows: readonly RouteSpeedHistoryCoverageIndexRow[]) {
  return new Map(
    rows.map((row) => [
      row.route_id,
      {
        routeSlug: row.route_slug,
        startMonth: row.history_start_month,
        endMonth: row.history_end_month,
        artifactPath: row.artifact_path,
        artifactStatus: row.artifact_status,
        monthCount: row.month_count,
        segmentCount: row.segment_count,
        cellCount: row.cell_count,
        availableCellCount: row.available_cell_count,
        missingCellCount: row.missing_cell_count,
      },
    ]),
  );
}

function emptyHistoryCoverage(): StudioRouteIndexSourceRow["historyCoverage"] {
  return {
    startMonth: null,
    endMonth: null,
    pointCount: 0,
    speedMonthCount: 0,
    ridershipMonthCount: 0,
  };
}

function emptyHistoryStats(): StudioRouteIndexSourceRow["historyStats"] {
  return {
    firstSpeedMonth: null,
    firstAverageSpeedMph: null,
    latestSpeedMonth: null,
    latestAverageSpeedMph: null,
    speedChangeMph: null,
    firstRidershipMonth: null,
    firstRidership: null,
    latestRidershipMonth: null,
    latestRidership: null,
    ridershipChange: null,
    speedMovement6mPct: null,
    speedMovement12mPct: null,
  };
}

function toReadiness(row: RouteReadinessIndexRow): StudioRouteIndexSourceRow["readiness"] {
  return {
    status: row.readiness_status,
    buildEligible: bool(row.build_eligible),
    score: row.readiness_score,
    speedObservationCount: row.speed_observation_count,
    speedBusTripCount: row.speed_bus_trip_count,
    averageSpeedMph: row.average_speed_mph,
    scheduleTimepointCount: row.schedule_timepoint_count,
    shapeCount: row.shape_count,
    stopCount: row.stop_count,
    timepointStopCount: row.timepoint_stop_count,
  };
}

function toSummary(row: RouteBriefSummaryIndexRow): StudioRouteIndexSourceRow["summary"] {
  return {
    publicVisible: bool(row.public_visible),
    routeScore: row.route_score,
    averageSpeedMph: row.average_speed_mph,
    hotspotCount: row.hotspot_count,
    totalRidership: row.total_ridership,
    aceActive: bool(row.ace_active),
    busLaneMatchedLaneCount: row.bus_lane_matched_lane_count,
  };
}

/**
 * Latest month with route brief summaries — the internal serving-month resolver
 * (hard-cutover C2). Public read paths use this instead of env.BASELINE_MONTH.
 */
export async function findLatestStudioServingMonth(db: D1ServingDb): Promise<string | null> {
  const rows = await db
    .select({ month: routeBriefSummary.month })
    .from(routeBriefSummary)
    .orderBy(desc(routeBriefSummary.month))
    .limit(1);
  const month = rows[0]?.month;
  return typeof month === "string" && IsoMonthSchema.safeParse(month).success ? month : null;
}

/** Latest month with a speed trend row — replaces env.LAST_BUILT_SPEED_MONTH in public reads (C3). */
export async function findLatestSpeedTrendMonth(db: D1ServingDb): Promise<string | null> {
  const rows = await db
    .select({ month: routeMonthTrend.month })
    .from(routeMonthTrend)
    .where(eq(routeMonthTrend.hasSpeedTrend, true))
    .orderBy(desc(routeMonthTrend.month))
    .limit(1);
  const month = rows[0]?.month;
  return typeof month === "string" && IsoMonthSchema.safeParse(month).success ? month : null;
}

export async function listStudioRouteIndexSourceRows(
  db: D1ServingDb,
  month: string,
): Promise<StudioRouteIndexSourceRow[]> {
  const [
    catalogRows,
    typeRows,
    readinessRows,
    summaryRows,
    artifactRows,
    trendRows,
    speedHistoryCoverageRows,
  ] = await Promise.all([
    db
      .select({
        route_id: routeCatalog.routeId,
        route_short_name: routeCatalog.routeShortName,
        route_long_name: routeCatalog.routeLongName,
        shape_count: routeCatalog.shapeCount,
        stop_count: routeCatalog.stopCount,
        timepoint_stop_count: routeCatalog.timepointStopCount,
      })
      .from(routeCatalog)
      .orderBy(asc(routeCatalog.routeId)),
    db
      .select({
        route_id: routeCatalogType.routeId,
        type_rank: routeCatalogType.typeRank,
        route_type: routeCatalogType.routeType,
      })
      .from(routeCatalogType)
      .orderBy(asc(routeCatalogType.routeId), asc(routeCatalogType.typeRank)),
    db
      .select({
        route_id: routeReadiness.routeId,
        month: routeReadiness.month,
        readiness_status: routeReadiness.readinessStatus,
        build_eligible: routeReadiness.buildEligible,
        readiness_score: routeReadiness.readinessScore,
        speed_observation_count: routeReadiness.speedObservationCount,
        speed_bus_trip_count: routeReadiness.speedBusTripCount,
        average_speed_mph: routeReadiness.averageSpeedMph,
        schedule_timepoint_count: routeReadiness.scheduleTimepointCount,
        shape_count: routeReadiness.shapeCount,
        stop_count: routeReadiness.stopCount,
        timepoint_stop_count: routeReadiness.timepointStopCount,
      })
      .from(routeReadiness)
      .where(eq(routeReadiness.month, month))
      .orderBy(asc(routeReadiness.routeId)),
    db
      .select({
        route_id: routeBriefSummary.routeId,
        month: routeBriefSummary.month,
        public_visible: routeBriefSummary.publicVisible,
        route_score: routeBriefSummary.routeScore,
        average_speed_mph: routeBriefSummary.averageSpeedMph,
        hotspot_count: routeBriefSummary.hotspotCount,
        total_ridership: routeBriefSummary.totalRidership,
        ace_active: routeBriefSummary.aceActive,
        bus_lane_matched_lane_count: routeBriefSummary.busLaneMatchedLaneCount,
      })
      .from(routeBriefSummary)
      .where(eq(routeBriefSummary.month, month))
      .orderBy(asc(routeBriefSummary.routeId)),
    db
      .select({
        route_id: routeArtifact.routeId,
        month: routeArtifact.month,
        artifact_name: routeArtifact.artifactName,
      })
      .from(routeArtifact)
      .where(eq(routeArtifact.month, month))
      .orderBy(asc(routeArtifact.routeId), asc(routeArtifact.artifactName)),
    db
      .select({
        route_id: routeMonthTrend.routeId,
        month: routeMonthTrend.month,
        average_speed_mph: routeMonthTrend.averageSpeedMph,
        ridership: routeMonthTrend.ridership,
        has_speed_trend: routeMonthTrend.hasSpeedTrend,
        has_ridership_trend: routeMonthTrend.hasRidershipTrend,
      })
      .from(routeMonthTrend)
      .orderBy(asc(routeMonthTrend.routeId), asc(routeMonthTrend.month)),
    listOptionalRouteSpeedHistoryCoverageRows(db, month),
  ]);

  const routeTypes = groupRouteTypes(
    typeRows.map((row) => RouteCatalogTypeIndexRowSchema.parse(row)),
  );
  const readiness = new Map(
    readinessRows.map((row) => {
      const parsed = RouteReadinessIndexRowSchema.parse(row);
      return [parsed.route_id, toReadiness(parsed)] as const;
    }),
  );
  const summaries = new Map(
    summaryRows.map((row) => {
      const parsed = RouteBriefSummaryIndexRowSchema.parse(row);
      return [parsed.route_id, toSummary(parsed)] as const;
    }),
  );
  const artifactNames = groupArtifactNames(
    artifactRows.map((row) => RouteArtifactIndexRowSchema.parse(row)),
  );
  const historyCoverage = groupHistoryCoverage(
    trendRows.map((row) => RouteMonthTrendIndexRowSchema.parse(row)),
  );
  const speedHistoryCoverage = groupSpeedHistoryCoverage(
    speedHistoryCoverageRows.map((row) => RouteSpeedHistoryCoverageIndexRowSchema.parse(row)),
  );

  return catalogRows.map((row): StudioRouteIndexSourceRow => {
    const parsed = RouteCatalogIndexRowSchema.parse(row);
    const history = historyCoverage.get(parsed.route_id);
    return {
      routeId: parsed.route_id,
      routeShortName: parsed.route_short_name,
      routeLongName: parsed.route_long_name,
      routeTypes: routeTypes.get(parsed.route_id) ?? [],
      shapeCount: parsed.shape_count,
      stopCount: parsed.stop_count,
      timepointStopCount: parsed.timepoint_stop_count,
      readiness: readiness.get(parsed.route_id) ?? null,
      summary: summaries.get(parsed.route_id) ?? null,
      artifactNames: artifactNames.get(parsed.route_id) ?? [],
      historyCoverage: history?.coverage ?? emptyHistoryCoverage(),
      historyStats: history?.stats ?? emptyHistoryStats(),
      speedHistoryCoverage: speedHistoryCoverage.get(parsed.route_id) ?? null,
    };
  });
}

async function listOptionalRouteSpeedHistoryCoverageRows(
  db: D1ServingDb,
  month: string,
): Promise<RouteSpeedHistoryCoverageIndexRow[]> {
  try {
    const rows = await db
      .select({
        route_id: routeSpeedHistoryCoverage.routeId,
        month: routeSpeedHistoryCoverage.month,
        route_slug: routeSpeedHistoryCoverage.routeSlug,
        history_start_month: routeSpeedHistoryCoverage.historyStartMonth,
        history_end_month: routeSpeedHistoryCoverage.historyEndMonth,
        artifact_path: routeSpeedHistoryCoverage.artifactPath,
        artifact_status: routeSpeedHistoryCoverage.artifactStatus,
        month_count: routeSpeedHistoryCoverage.monthCount,
        segment_count: routeSpeedHistoryCoverage.segmentCount,
        cell_count: routeSpeedHistoryCoverage.cellCount,
        available_cell_count: routeSpeedHistoryCoverage.availableCellCount,
        missing_cell_count: routeSpeedHistoryCoverage.missingCellCount,
      })
      .from(routeSpeedHistoryCoverage)
      .where(eq(routeSpeedHistoryCoverage.month, month))
      .orderBy(asc(routeSpeedHistoryCoverage.routeId));
    return rows.map((row) => RouteSpeedHistoryCoverageIndexRowSchema.parse(row));
  } catch (error) {
    if (isMissingRouteSpeedHistoryCoverageTable(error)) return [];
    throw error;
  }
}
