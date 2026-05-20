import { asc, desc, eq, sql } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import {
  localRouteBuildPlan,
  localRouteCatalog,
  localRouteCatalogType,
  localRouteDirection,
  localRouteLionLink,
  localRouteMonthCoverage,
  localRouteReadiness,
  localRouteReadinessMissingInput,
} from "../schema.js";

export type LocalRouteCatalogEntry = {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  routeTypes: string[];
  directions: string[];
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
  latitudeMin: number | null;
  latitudeMax: number | null;
  longitudeMin: number | null;
  longitudeMax: number | null;
};

export type LocalRouteMonthCoverage = {
  routeId: string;
  isoMonth: string;
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  hasSpeedData: boolean;
  hasScheduleData: boolean;
};

export type LocalRouteReadinessStatus =
  | "ready"
  | "partial"
  | "missing_geometry"
  | "missing_schedule"
  | "missing_speed";

export type LocalRouteReadiness = {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  isoMonth: string;
  readinessStatus: LocalRouteReadinessStatus;
  buildEligible: boolean;
  readinessScore: number;
  missingInputs: string[];
  speedObservationCount: number;
  speedBusTripCount: number;
  averageSpeedMph: number | null;
  scheduleTimepointCount: number;
  shapeCount: number;
  stopCount: number;
  timepointStopCount: number;
};

export type LocalRouteBuildPlanStatus = "selected" | "backlog" | "already_built" | "blocked";

export type LocalRouteBuildPlan = LocalRouteReadiness & {
  candidateRank: number | null;
  planStatus: LocalRouteBuildPlanStatus;
  selectedForNextBatch: boolean;
  alreadyBuilt: boolean;
  priorityScore: number;
};

function routeMonthKey(routeId: string, month: string): string {
  return `${routeId}::${month}`;
}

function groupRouteValues<T extends { routeId: string }>(
  rows: readonly T[],
  value: (row: T) => string,
): Map<string, string[]> {
  const output = new Map<string, string[]>();

  for (const row of rows) {
    const group = output.get(row.routeId) ?? [];
    group.push(value(row));
    output.set(row.routeId, group);
  }

  return output;
}

function groupMissingInputs(
  rows: readonly { routeId: string; month: string; inputName: string }[],
): Map<string, string[]> {
  const output = new Map<string, string[]>();

  for (const row of rows) {
    const key = routeMonthKey(row.routeId, row.month);
    const group = output.get(key) ?? [];
    group.push(row.inputName);
    output.set(key, group);
  }

  return output;
}

const readinessStatusRank = sql<number>`case ${localRouteReadiness.readinessStatus}
  when 'ready' then 0
  when 'partial' then 1
  when 'missing_schedule' then 2
  when 'missing_speed' then 3
  when 'missing_geometry' then 4
  else 5
end`;

const buildPlanStatusRank = sql<number>`case ${localRouteBuildPlan.planStatus}
  when 'selected' then 0
  when 'backlog' then 1
  when 'already_built' then 2
  when 'blocked' then 3
  else 4
end`;

export async function replaceRouteCatalog(
  db: LocalPipelineDb,
  rows: readonly LocalRouteCatalogEntry[],
): Promise<void> {
  await db.delete(localRouteCatalogType);
  await db.delete(localRouteDirection);
  await db.delete(localRouteCatalog);

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteCatalog).values(
    rows.map((row) => ({
      routeId: row.routeId,
      routeShortName: row.routeShortName,
      routeLongName: row.routeLongName,
      shapeCount: row.shapeCount,
      stopCount: row.stopCount,
      timepointStopCount: row.timepointStopCount,
      latitudeMin: row.latitudeMin,
      latitudeMax: row.latitudeMax,
      longitudeMin: row.longitudeMin,
      longitudeMax: row.longitudeMax,
    })),
  );

  const routeTypes = rows.flatMap((row) =>
    row.routeTypes.map((routeType, index) => ({
      routeId: row.routeId,
      typeRank: index + 1,
      routeType,
    })),
  );
  const directions = rows.flatMap((row) =>
    row.directions.map((directionName, index) => ({
      routeId: row.routeId,
      directionRank: index,
      directionName,
    })),
  );

  if (routeTypes.length > 0) {
    await db.insert(localRouteCatalogType).values(routeTypes);
  }
  if (directions.length > 0) {
    await db.insert(localRouteDirection).values(directions);
  }
}

// Distinct route_ids that have any LION segment link. Used by detectors to
// answer the "do we have geometry for this route?" question without joining
// the full link table per route.
export async function listRouteIdsWithLionLink(db: LocalPipelineDb): Promise<string[]> {
  const rows = (await db
    .selectDistinct({ routeId: localRouteLionLink.routeId })
    .from(localRouteLionLink)
    .orderBy(asc(localRouteLionLink.routeId))) as Array<{ routeId: string }>;
  return rows.map((row) => row.routeId);
}

export async function listRouteCatalog(db: LocalPipelineDb): Promise<LocalRouteCatalogEntry[]> {
  const [routes, routeTypes, directions] = await Promise.all([
    db.select().from(localRouteCatalog).orderBy(asc(localRouteCatalog.routeId)),
    db
      .select()
      .from(localRouteCatalogType)
      .orderBy(asc(localRouteCatalogType.routeId), asc(localRouteCatalogType.typeRank)),
    db
      .select()
      .from(localRouteDirection)
      .orderBy(asc(localRouteDirection.routeId), asc(localRouteDirection.directionRank)),
  ]);
  const routeTypesByRoute = groupRouteValues(routeTypes, (row) => row.routeType);
  const directionsByRoute = groupRouteValues(directions, (row) => row.directionName);

  return routes.map((row) => ({
    routeId: row.routeId,
    routeShortName: row.routeShortName,
    routeLongName: row.routeLongName,
    routeTypes: routeTypesByRoute.get(row.routeId) ?? [],
    directions: directionsByRoute.get(row.routeId) ?? [],
    shapeCount: row.shapeCount,
    stopCount: row.stopCount,
    timepointStopCount: row.timepointStopCount,
    latitudeMin: row.latitudeMin,
    latitudeMax: row.latitudeMax,
    longitudeMin: row.longitudeMin,
    longitudeMax: row.longitudeMax,
  }));
}

export async function replaceRouteMonthCoverage(
  db: LocalPipelineDb,
  month: string,
  rows: readonly LocalRouteMonthCoverage[],
): Promise<void> {
  await db.delete(localRouteMonthCoverage).where(eq(localRouteMonthCoverage.month, month));

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteMonthCoverage).values(
    rows.map((row) => ({
      routeId: row.routeId,
      month: row.isoMonth,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
      hasSpeedData: row.hasSpeedData,
      hasScheduleData: row.hasScheduleData,
    })),
  );
}

export async function listRouteMonthCoverage(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteMonthCoverage[]> {
  const rows = await db
    .select()
    .from(localRouteMonthCoverage)
    .where(eq(localRouteMonthCoverage.month, month))
    .orderBy(asc(localRouteMonthCoverage.routeId));

  return rows.map((row) => ({
    routeId: row.routeId,
    isoMonth: row.month,
    speedObservationCount: row.speedObservationCount,
    speedBusTripCount: row.speedBusTripCount,
    averageSpeedMph: row.averageSpeedMph,
    scheduleTimepointCount: row.scheduleTimepointCount,
    hasSpeedData: row.hasSpeedData,
    hasScheduleData: row.hasScheduleData,
  }));
}

export async function replaceRouteReadiness(
  db: LocalPipelineDb,
  month: string,
  rows: readonly LocalRouteReadiness[],
): Promise<void> {
  await db
    .delete(localRouteReadinessMissingInput)
    .where(eq(localRouteReadinessMissingInput.month, month));
  await db.delete(localRouteReadiness).where(eq(localRouteReadiness.month, month));

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteReadiness).values(
    rows.map((row) => ({
      routeId: row.routeId,
      month: row.isoMonth,
      routeShortName: row.routeShortName,
      routeLongName: row.routeLongName,
      readinessStatus: row.readinessStatus,
      buildEligible: row.buildEligible,
      readinessScore: row.readinessScore,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
      shapeCount: row.shapeCount,
      stopCount: row.stopCount,
      timepointStopCount: row.timepointStopCount,
    })),
  );

  const missingInputs = rows.flatMap((row) =>
    row.missingInputs.map((inputName, index) => ({
      routeId: row.routeId,
      month: row.isoMonth,
      inputRank: index + 1,
      inputName,
    })),
  );

  if (missingInputs.length > 0) {
    await db.insert(localRouteReadinessMissingInput).values(missingInputs);
  }
}

export async function listRouteReadiness(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteReadiness[]> {
  const [rows, missingInputRows] = await Promise.all([
    db
      .select()
      .from(localRouteReadiness)
      .where(eq(localRouteReadiness.month, month))
      .orderBy(
        desc(localRouteReadiness.buildEligible),
        readinessStatusRank,
        desc(localRouteReadiness.readinessScore),
        asc(localRouteReadiness.averageSpeedMph),
        asc(localRouteReadiness.routeId),
      ),
    db
      .select()
      .from(localRouteReadinessMissingInput)
      .where(eq(localRouteReadinessMissingInput.month, month))
      .orderBy(
        asc(localRouteReadinessMissingInput.routeId),
        asc(localRouteReadinessMissingInput.inputRank),
      ),
  ]);
  const missingInputsByRouteMonth = groupMissingInputs(missingInputRows);

  return rows.map((row) => ({
    routeId: row.routeId,
    routeShortName: row.routeShortName,
    routeLongName: row.routeLongName,
    isoMonth: row.month,
    readinessStatus: row.readinessStatus as LocalRouteReadinessStatus,
    buildEligible: row.buildEligible,
    readinessScore: row.readinessScore,
    missingInputs: missingInputsByRouteMonth.get(routeMonthKey(row.routeId, row.month)) ?? [],
    speedObservationCount: row.speedObservationCount,
    speedBusTripCount: row.speedBusTripCount,
    averageSpeedMph: row.averageSpeedMph,
    scheduleTimepointCount: row.scheduleTimepointCount,
    shapeCount: row.shapeCount,
    stopCount: row.stopCount,
    timepointStopCount: row.timepointStopCount,
  }));
}

export async function replaceRouteBuildPlan(
  db: LocalPipelineDb,
  month: string,
  rows: readonly LocalRouteBuildPlan[],
): Promise<void> {
  await db.delete(localRouteBuildPlan).where(eq(localRouteBuildPlan.month, month));

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteBuildPlan).values(
    rows.map((row) => ({
      routeId: row.routeId,
      month: row.isoMonth,
      routeShortName: row.routeShortName,
      routeLongName: row.routeLongName,
      candidateRank: row.candidateRank,
      planStatus: row.planStatus,
      selectedForNextBatch: row.selectedForNextBatch,
      alreadyBuilt: row.alreadyBuilt,
      buildEligible: row.buildEligible,
      priorityScore: row.priorityScore,
      readinessStatus: row.readinessStatus,
      readinessScore: row.readinessScore,
      speedObservationCount: row.speedObservationCount,
      speedBusTripCount: row.speedBusTripCount,
      averageSpeedMph: row.averageSpeedMph,
      scheduleTimepointCount: row.scheduleTimepointCount,
      shapeCount: row.shapeCount,
      stopCount: row.stopCount,
      timepointStopCount: row.timepointStopCount,
    })),
  );
}

export async function listRouteBuildPlan(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBuildPlan[]> {
  const rows = await db
    .select()
    .from(localRouteBuildPlan)
    .where(eq(localRouteBuildPlan.month, month))
    .orderBy(
      buildPlanStatusRank,
      asc(localRouteBuildPlan.candidateRank),
      desc(localRouteBuildPlan.priorityScore),
      asc(localRouteBuildPlan.routeId),
    );
  const readinessRows = await listRouteReadiness(db, month);
  const missingInputsByRouteMonth = new Map(
    readinessRows.map((row) => [routeMonthKey(row.routeId, row.isoMonth), row.missingInputs]),
  );

  return rows.map((row) => ({
    routeId: row.routeId,
    routeShortName: row.routeShortName,
    routeLongName: row.routeLongName,
    isoMonth: row.month,
    readinessStatus: row.readinessStatus as LocalRouteReadinessStatus,
    buildEligible: row.buildEligible,
    readinessScore: row.readinessScore,
    missingInputs: missingInputsByRouteMonth.get(routeMonthKey(row.routeId, row.month)) ?? [],
    speedObservationCount: row.speedObservationCount,
    speedBusTripCount: row.speedBusTripCount,
    averageSpeedMph: row.averageSpeedMph,
    scheduleTimepointCount: row.scheduleTimepointCount,
    shapeCount: row.shapeCount,
    stopCount: row.stopCount,
    timepointStopCount: row.timepointStopCount,
    candidateRank: row.candidateRank,
    planStatus: row.planStatus as LocalRouteBuildPlanStatus,
    selectedForNextBatch: row.selectedForNextBatch,
    alreadyBuilt: row.alreadyBuilt,
    priorityScore: row.priorityScore,
  }));
}

export async function listSelectedRouteBuildCandidates(
  db: LocalPipelineDb,
  month: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<LocalRouteBuildPlan[]> {
  return (await listRouteBuildPlan(db, month))
    .filter((row) => row.selectedForNextBatch)
    .sort((left, right) => {
      if (left.candidateRank !== null && right.candidateRank !== null) {
        return left.candidateRank - right.candidateRank;
      }

      return left.routeId.localeCompare(right.routeId);
    })
    .slice(0, limit);
}

export async function listBuildEligibleRouteIds(
  db: LocalPipelineDb,
  month: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<string[]> {
  return (await listRouteBuildPlan(db, month))
    .filter((row) => row.buildEligible)
    .sort((left, right) => {
      if (left.candidateRank !== null && right.candidateRank !== null) {
        return left.candidateRank - right.candidateRank;
      }
      if (left.candidateRank !== null) {
        return -1;
      }
      if (right.candidateRank !== null) {
        return 1;
      }
      if (left.priorityScore !== right.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      return left.routeId.localeCompare(right.routeId);
    })
    .slice(0, limit)
    .map((row) => row.routeId);
}

export async function getRouteMonthCoverageMap(
  db: LocalPipelineDb,
  month: string,
): Promise<Map<string, LocalRouteMonthCoverage>> {
  return new Map((await listRouteMonthCoverage(db, month)).map((row) => [row.routeId, row]));
}
