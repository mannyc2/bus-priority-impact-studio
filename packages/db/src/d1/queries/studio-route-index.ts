import { asc, desc, eq, min } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import {
  routeArtifact,
  routeBatchStatus,
  routeBriefSummary,
  routeCatalog,
  routeCatalogTripType,
  routeCatalogType,
  routeMonthTrend,
  routeReadiness,
  routeSpeedHistoryCoverage,
} from "../schema.js";
import { sqliteBool } from "./shared.js";

type RouteCatalogTypeIndexRow = Awaited<ReturnType<typeof selectRouteCatalogTypeIndexRows>>[number];
type RouteCatalogTripTypeIndexRow = Awaited<
  ReturnType<typeof selectRouteCatalogTripTypeIndexRows>
>[number];
type RouteReadinessIndexRow = Awaited<ReturnType<typeof selectRouteReadinessIndexRows>>[number];
type RouteBriefSummaryIndexRow = Awaited<
  ReturnType<typeof selectRouteBriefSummaryIndexRows>
>[number];
type RouteArtifactIndexRow = Awaited<ReturnType<typeof selectRouteArtifactIndexRows>>[number];
type RouteMonthTrendIndexRow = Awaited<ReturnType<typeof selectRouteMonthTrendIndexRows>>[number];
type RouteSpeedHistoryCoverageIndexRow = Awaited<
  ReturnType<typeof listOptionalRouteSpeedHistoryCoverageRows>
>[number];

function isMissingRouteSpeedHistoryCoverageTable(error: unknown): boolean {
  const message = errorMessageWithCauses(error);
  return message.includes("no such table") && message.includes("route_speed_history_coverage");
}

function errorMessageWithCauses(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause === undefined ? "" : ` ${errorMessageWithCauses(error.cause)}`;
  return `${error.message}${cause}`;
}

export type StudioRouteIndexSourceRow = {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  routeTypes: string[];
  shapeCount: number;
  tripTypes: string[];
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
    spineReadiness:
      | "series_ready"
      | "series_ready_with_gaps"
      | "needs_pattern_review"
      | "failed"
      | null;
    spineReasons: string[];
    matchedCurrentSegmentCount: number | null;
    unmatchedCurrentSegmentCount: number | null;
    monthCount: number;
    segmentCount: number;
    cellCount: number;
    availableCellCount: number;
    missingCellCount: number;
  } | null;
};

function bool(value: boolean | number): boolean {
  return sqliteBool(value);
}

function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
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

function groupTripTypes(rows: readonly RouteCatalogTripTypeIndexRow[]): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const row of rows) {
    const group = output.get(row.route_id) ?? [];
    group.push(row.trip_type);
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

function normalizeSpineReadiness(
  value: unknown,
): NonNullable<StudioRouteIndexSourceRow["speedHistoryCoverage"]>["spineReadiness"] {
  return value === "series_ready" ||
    value === "series_ready_with_gaps" ||
    value === "needs_pattern_review" ||
    value === "failed"
    ? value
    : null;
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
        spineReadiness: normalizeSpineReadiness(row.spine_readiness),
        spineReasons: (() => {
          try {
            const value: unknown = JSON.parse(row.spine_reason_json ?? "[]");
            return Array.isArray(value) && value.every((item) => typeof item === "string")
              ? value
              : [];
          } catch {
            return [];
          }
        })(),
        matchedCurrentSegmentCount: row.matched_current_segment_count ?? null,
        unmatchedCurrentSegmentCount: row.unmatched_current_segment_count ?? null,
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

async function selectRouteCatalogIndexRows(db: D1ServingDb) {
  return db
    .select({
      route_id: routeCatalog.routeId,
      route_short_name: routeCatalog.routeShortName,
      route_long_name: routeCatalog.routeLongName,
      shape_count: routeCatalog.shapeCount,
      stop_count: routeCatalog.stopCount,
      timepoint_stop_count: routeCatalog.timepointStopCount,
    })
    .from(routeCatalog)
    .orderBy(asc(routeCatalog.routeId));
}

async function selectRouteCatalogTypeIndexRows(db: D1ServingDb) {
  return db
    .select({
      route_id: routeCatalogType.routeId,
      type_rank: routeCatalogType.typeRank,
      route_type: routeCatalogType.routeType,
    })
    .from(routeCatalogType)
    .orderBy(asc(routeCatalogType.routeId), asc(routeCatalogType.typeRank));
}

async function selectRouteCatalogTripTypeIndexRows(db: D1ServingDb) {
  return db
    .select({
      route_id: routeCatalogTripType.routeId,
      trip_type_rank: routeCatalogTripType.tripTypeRank,
      trip_type: routeCatalogTripType.tripType,
    })
    .from(routeCatalogTripType)
    .orderBy(asc(routeCatalogTripType.routeId), asc(routeCatalogTripType.tripTypeRank));
}

async function selectRouteReadinessIndexRows(db: D1ServingDb, month: string) {
  return db
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
    .orderBy(asc(routeReadiness.routeId));
}

async function selectRouteBriefSummaryIndexRows(db: D1ServingDb, month: string) {
  return db
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
    .orderBy(asc(routeBriefSummary.routeId));
}

async function selectRouteArtifactIndexRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeArtifact.routeId,
      month: routeArtifact.month,
      artifact_name: routeArtifact.artifactName,
    })
    .from(routeArtifact)
    .where(eq(routeArtifact.month, month))
    .orderBy(asc(routeArtifact.routeId), asc(routeArtifact.artifactName));
}

async function selectRouteMonthTrendIndexRows(db: D1ServingDb) {
  return db
    .select({
      route_id: routeMonthTrend.routeId,
      month: routeMonthTrend.month,
      average_speed_mph: routeMonthTrend.averageSpeedMph,
      ridership: routeMonthTrend.ridership,
      has_speed_trend: routeMonthTrend.hasSpeedTrend,
      has_ridership_trend: routeMonthTrend.hasRidershipTrend,
    })
    .from(routeMonthTrend)
    .orderBy(asc(routeMonthTrend.routeId), asc(routeMonthTrend.month));
}

/** Latest month with route brief summaries for internal single-partition reads. */
export async function findLatestStudioServingMonth(db: D1ServingDb): Promise<string | null> {
  const rows = await db
    .select({ month: routeBriefSummary.month })
    .from(routeBriefSummary)
    .orderBy(desc(routeBriefSummary.month))
    .limit(1);
  const month = rows[0]?.month;
  return typeof month === "string" && isIsoMonth(month) ? month : null;
}

/** Latest covered month with a public speed trend row. */
export async function findLatestSpeedTrendMonth(db: D1ServingDb): Promise<string | null> {
  const rows = await db
    .select({ month: routeMonthTrend.month })
    .from(routeMonthTrend)
    .where(eq(routeMonthTrend.hasSpeedTrend, true))
    .orderBy(desc(routeMonthTrend.month))
    .limit(1);
  const month = rows[0]?.month;
  return typeof month === "string" && isIsoMonth(month) ? month : null;
}

/** Earliest covered month with a public speed trend row. */
export async function findEarliestSpeedTrendMonth(db: D1ServingDb): Promise<string | null> {
  const rows = await db
    .select({ month: min(routeMonthTrend.month) })
    .from(routeMonthTrend)
    .where(eq(routeMonthTrend.hasSpeedTrend, true))
    .limit(1);
  const month = rows[0]?.month;
  return typeof month === "string" && isIsoMonth(month) ? month : null;
}

export type PublishedStudioServingRelease = {
  end: string;
  publishedAt: string;
};

/** Latest passing route batch that has route-summary serving rows. */
export async function findLatestPublishedStudioServingRelease(
  db: D1ServingDb,
): Promise<PublishedStudioServingRelease | null> {
  const rows = await db
    .select({
      end: routeBatchStatus.month,
      publishedAt: routeBatchStatus.generatedAt,
    })
    .from(routeBatchStatus)
    .innerJoin(routeBriefSummary, eq(routeBriefSummary.month, routeBatchStatus.month))
    .where(eq(routeBatchStatus.status, "pass"))
    .orderBy(desc(routeBatchStatus.month))
    .limit(1);
  const row = rows[0];
  return row !== undefined && isIsoMonth(row.end) && typeof row.publishedAt === "string"
    ? row
    : null;
}

export async function listStudioRouteIndexSourceRows(
  db: D1ServingDb,
  month: string,
): Promise<StudioRouteIndexSourceRow[]> {
  const [
    catalogRows,
    typeRows,
    tripTypeRows,
    readinessRows,
    summaryRows,
    artifactRows,
    trendRows,
    speedHistoryCoverageRows,
  ] = await Promise.all([
    selectRouteCatalogIndexRows(db),
    selectRouteCatalogTypeIndexRows(db),
    selectRouteCatalogTripTypeIndexRows(db),
    selectRouteReadinessIndexRows(db, month),
    selectRouteBriefSummaryIndexRows(db, month),
    selectRouteArtifactIndexRows(db, month),
    selectRouteMonthTrendIndexRows(db),
    listOptionalRouteSpeedHistoryCoverageRows(db, month),
  ]);

  const routeTypes = groupRouteTypes(typeRows);
  const tripTypes = groupTripTypes(tripTypeRows);
  const readiness = new Map(
    readinessRows.map((row) => {
      return [row.route_id, toReadiness(row)] as const;
    }),
  );
  const summaries = new Map(
    summaryRows.map((row) => {
      return [row.route_id, toSummary(row)] as const;
    }),
  );
  const artifactNames = groupArtifactNames(artifactRows);
  const historyCoverage = groupHistoryCoverage(trendRows);
  const speedHistoryCoverage = groupSpeedHistoryCoverage(speedHistoryCoverageRows);

  return catalogRows.map((row): StudioRouteIndexSourceRow => {
    const history = historyCoverage.get(row.route_id);
    return {
      routeId: row.route_id,
      routeShortName: row.route_short_name,
      routeLongName: row.route_long_name,
      routeTypes: routeTypes.get(row.route_id) ?? [],
      shapeCount: row.shape_count,
      stopCount: row.stop_count,
      timepointStopCount: row.timepoint_stop_count,
      tripTypes: tripTypes.get(row.route_id) ?? [],
      readiness: readiness.get(row.route_id) ?? null,
      summary: summaries.get(row.route_id) ?? null,
      artifactNames: artifactNames.get(row.route_id) ?? [],
      historyCoverage: history?.coverage ?? emptyHistoryCoverage(),
      historyStats: history?.stats ?? emptyHistoryStats(),
      speedHistoryCoverage: speedHistoryCoverage.get(row.route_id) ?? null,
    };
  });
}

async function listOptionalRouteSpeedHistoryCoverageRows(db: D1ServingDb, month: string) {
  try {
    return await db
      .select({
        route_id: routeSpeedHistoryCoverage.routeId,
        month: routeSpeedHistoryCoverage.month,
        route_slug: routeSpeedHistoryCoverage.routeSlug,
        history_start_month: routeSpeedHistoryCoverage.historyStartMonth,
        history_end_month: routeSpeedHistoryCoverage.historyEndMonth,
        artifact_path: routeSpeedHistoryCoverage.artifactPath,
        artifact_status: routeSpeedHistoryCoverage.artifactStatus,
        spine_readiness: routeSpeedHistoryCoverage.spineReadiness,
        spine_reason_json: routeSpeedHistoryCoverage.spineReasonJson,
        matched_current_segment_count: routeSpeedHistoryCoverage.matchedCurrentSegmentCount,
        unmatched_current_segment_count: routeSpeedHistoryCoverage.unmatchedCurrentSegmentCount,
        month_count: routeSpeedHistoryCoverage.monthCount,
        segment_count: routeSpeedHistoryCoverage.segmentCount,
        cell_count: routeSpeedHistoryCoverage.cellCount,
        available_cell_count: routeSpeedHistoryCoverage.availableCellCount,
        missing_cell_count: routeSpeedHistoryCoverage.missingCellCount,
      })
      .from(routeSpeedHistoryCoverage)
      .where(eq(routeSpeedHistoryCoverage.month, month))
      .orderBy(asc(routeSpeedHistoryCoverage.routeId));
  } catch (error) {
    if (isMissingRouteSpeedHistoryCoverageTable(error)) return [];
    throw error;
  }
}
