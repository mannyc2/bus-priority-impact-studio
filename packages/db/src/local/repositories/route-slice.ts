import { and, asc, eq } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
import {
  localRouteHotspot,
  localRouteHotspotSummary,
  localRouteHourlyRidership,
  localRouteScheduleTimepoint,
  localRouteSegmentSpeed,
  localRouteSegmentSpeedCell,
  localRouteStop,
} from "../schema.js";

export type LocalRouteSegmentSpeed = {
  routeId: string;
  isoMonth: string;
  timestamp: string;
  dayOfWeek: string;
  hourOfDay: number;
  direction: string;
  borough: string;
  routeType: string;
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  timepointStopLatitude: number;
  timepointStopLongitude: number;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  nextTimepointStopLatitude: number;
  nextTimepointStopLongitude: number;
  roadDistanceMiles: number;
  averageTravelTimeMinutes: number;
  averageRoadSpeedMph: number;
  busTripCount: number;
};

export type LocalRouteSegmentSpeedCell = {
  routeId: string;
  isoMonth: string;
  timestamp: string;
  dayOfWeek: string;
  hourOfDay: number;
  direction: string;
  borough: string;
  routeType: string;
  stopOrder: number;
  timepointStopId: string | null;
  timepointStopName: string | null;
  timepointStopLatitude: number | null;
  timepointStopLongitude: number | null;
  nextTimepointStopId: string | null;
  nextTimepointStopName: string | null;
  nextTimepointStopLatitude: number | null;
  nextTimepointStopLongitude: number | null;
  roadDistanceMiles: number | null;
  averageTravelTimeMinutes: number | null;
  averageRoadSpeedMph: number | null;
  busTripCount: number | null;
};

export type LocalRouteHourlyRidership = {
  routeId: string;
  isoMonth: string;
  dayOfWeek: string;
  hourOfDay: number;
  ridership: number;
  transfers: number;
};

export type LocalRouteScheduleTimepoint = {
  routeId: string;
  isoMonth: string;
  scheduleDate: string;
  dayType: string;
  direction: string;
  shapeId: string;
  stopSequence: number;
  stopId: string;
  stopName?: string | undefined;
  scheduleTime: string;
  distanceFromStart?: number | undefined;
  tripHeadsign?: string | undefined;
  blockId: string;
  bundle?: string | undefined;
};

export type LocalRouteStop = {
  routeId: string;
  isoMonth: string;
  routeShortName: string;
  stopId: string;
  stopName: string;
  inEffect: boolean;
  directionId: string;
  direction: string;
  timepoint: boolean;
  latitude: number;
  longitude: number;
};

export type LocalRouteHotspotSummary = {
  routeId: string;
  isoMonth: string;
  generatedAt: string;
  routeWeightedAverageSpeedMph: number;
  observationCount: number;
  busTripCount: number;
  ridershipWeighted: boolean;
  ridershipWindowCount: number;
  ridershipMatchedObservationCount: number;
  ridershipExposure: number;
  segmentCount: number;
  hotspotCount: number;
};

export type LocalRouteHotspot = {
  routeId: string;
  isoMonth: string;
  hotspotRank?: number | undefined;
  segmentId: string;
  direction: string;
  stopOrder: number;
  timepointStopId: string;
  timepointStopName: string;
  nextTimepointStopId: string;
  nextTimepointStopName: string;
  observationCount: number;
  busTripCount: number;
  weightedAverageSpeedMph: number;
  weightedAverageTravelTimeMinutes: number;
  averageRoadDistanceMiles: number;
  slowWindowShare: number;
  speedSeverity: number;
  hotspotScore: number;
  ridershipExposure?: number | undefined;
  transferExposure?: number | undefined;
  riderDelayIndex?: number | undefined;
  riderImpactShare?: number | undefined;
  riderWeightedSpeedSeverity?: number | undefined;
  riderWeightedSlowWindowShare?: number | undefined;
  riderImpactScore?: number | undefined;
};

export function replaceRouteSegmentSpeeds(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteSegmentSpeed[],
): void {
  const values = rows.map((row, index) => ({
    routeId: row.routeId,
    month: row.isoMonth,
    rowRank: index + 1,
    timestamp: row.timestamp,
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    direction: row.direction,
    borough: row.borough,
    routeType: row.routeType,
    stopOrder: row.stopOrder,
    timepointStopId: row.timepointStopId,
    timepointStopName: row.timepointStopName,
    timepointStopLatitude: row.timepointStopLatitude,
    timepointStopLongitude: row.timepointStopLongitude,
    nextTimepointStopId: row.nextTimepointStopId,
    nextTimepointStopName: row.nextTimepointStopName,
    nextTimepointStopLatitude: row.nextTimepointStopLatitude,
    nextTimepointStopLongitude: row.nextTimepointStopLongitude,
    roadDistanceMiles: row.roadDistanceMiles,
    averageTravelTimeMinutes: row.averageTravelTimeMinutes,
    averageRoadSpeedMph: row.averageRoadSpeedMph,
    busTripCount: row.busTripCount,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteSegmentSpeed)
      .where(
        and(eq(localRouteSegmentSpeed.routeId, routeId), eq(localRouteSegmentSpeed.month, month)),
      )
      .run();
    insertAll(tx, localRouteSegmentSpeed, values);
  });
}

export async function listRouteSegmentSpeeds(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteSegmentSpeed[]> {
  const rows = await db
    .select()
    .from(localRouteSegmentSpeed)
    .where(
      and(eq(localRouteSegmentSpeed.routeId, routeId), eq(localRouteSegmentSpeed.month, month)),
    )
    .orderBy(asc(localRouteSegmentSpeed.rowRank));

  return rows.map((row) => ({
    routeId: row.routeId,
    isoMonth: row.month,
    timestamp: row.timestamp,
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    direction: row.direction,
    borough: row.borough,
    routeType: row.routeType,
    stopOrder: row.stopOrder,
    timepointStopId: row.timepointStopId,
    timepointStopName: row.timepointStopName,
    timepointStopLatitude: row.timepointStopLatitude,
    timepointStopLongitude: row.timepointStopLongitude,
    nextTimepointStopId: row.nextTimepointStopId,
    nextTimepointStopName: row.nextTimepointStopName,
    nextTimepointStopLatitude: row.nextTimepointStopLatitude,
    nextTimepointStopLongitude: row.nextTimepointStopLongitude,
    roadDistanceMiles: row.roadDistanceMiles,
    averageTravelTimeMinutes: row.averageTravelTimeMinutes,
    averageRoadSpeedMph: row.averageRoadSpeedMph,
    busTripCount: row.busTripCount,
  }));
}

export function replaceRouteSegmentSpeedCells(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteSegmentSpeedCell[],
): void {
  const values = rows.map((row, index) => ({
    routeId: row.routeId,
    month: row.isoMonth,
    cellRank: index + 1,
    timestamp: row.timestamp,
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    direction: row.direction,
    borough: row.borough,
    routeType: row.routeType,
    stopOrder: row.stopOrder,
    timepointStopId: row.timepointStopId,
    timepointStopName: row.timepointStopName,
    timepointStopLatitude: row.timepointStopLatitude,
    timepointStopLongitude: row.timepointStopLongitude,
    nextTimepointStopId: row.nextTimepointStopId,
    nextTimepointStopName: row.nextTimepointStopName,
    nextTimepointStopLatitude: row.nextTimepointStopLatitude,
    nextTimepointStopLongitude: row.nextTimepointStopLongitude,
    roadDistanceMiles: row.roadDistanceMiles,
    averageTravelTimeMinutes: row.averageTravelTimeMinutes,
    averageRoadSpeedMph: row.averageRoadSpeedMph,
    busTripCount: row.busTripCount,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteSegmentSpeedCell)
      .where(
        and(
          eq(localRouteSegmentSpeedCell.routeId, routeId),
          eq(localRouteSegmentSpeedCell.month, month),
        ),
      )
      .run();
    insertAll(tx, localRouteSegmentSpeedCell, values);
  });
}

export async function listRouteSegmentSpeedCells(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteSegmentSpeedCell[]> {
  const rows = await db
    .select()
    .from(localRouteSegmentSpeedCell)
    .where(
      and(
        eq(localRouteSegmentSpeedCell.routeId, routeId),
        eq(localRouteSegmentSpeedCell.month, month),
      ),
    )
    .orderBy(asc(localRouteSegmentSpeedCell.cellRank));

  return rows.map(({ month: isoMonth, cellRank: _cellRank, ...row }) => ({
    ...row,
    isoMonth,
  }));
}

export function replaceRouteHourlyRidership(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteHourlyRidership[],
): void {
  const values = rows.map((row) => ({
    routeId: row.routeId,
    month: row.isoMonth,
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    ridership: row.ridership,
    transfers: row.transfers,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteHourlyRidership)
      .where(
        and(
          eq(localRouteHourlyRidership.routeId, routeId),
          eq(localRouteHourlyRidership.month, month),
        ),
      )
      .run();
    insertAll(tx, localRouteHourlyRidership, values);
  });
}

export async function listRouteHourlyRidership(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteHourlyRidership[]> {
  const rows = await db
    .select()
    .from(localRouteHourlyRidership)
    .where(
      and(
        eq(localRouteHourlyRidership.routeId, routeId),
        eq(localRouteHourlyRidership.month, month),
      ),
    )
    .orderBy(asc(localRouteHourlyRidership.dayOfWeek), asc(localRouteHourlyRidership.hourOfDay));

  return rows.map((row) => ({
    routeId: row.routeId,
    isoMonth: row.month,
    dayOfWeek: row.dayOfWeek,
    hourOfDay: row.hourOfDay,
    ridership: row.ridership,
    transfers: row.transfers,
  }));
}

export function replaceRouteSchedules(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteScheduleTimepoint[],
): void {
  const values = rows.map((row, index) => ({
    routeId: row.routeId,
    month: row.isoMonth,
    rowRank: index + 1,
    scheduleDate: row.scheduleDate,
    dayType: row.dayType,
    direction: row.direction,
    shapeId: row.shapeId,
    stopSequence: row.stopSequence,
    stopId: row.stopId,
    stopName: row.stopName ?? null,
    scheduleTime: row.scheduleTime,
    distanceFromStart: row.distanceFromStart ?? null,
    tripHeadsign: row.tripHeadsign ?? null,
    blockId: row.blockId,
    bundle: row.bundle ?? null,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteScheduleTimepoint)
      .where(
        and(
          eq(localRouteScheduleTimepoint.routeId, routeId),
          eq(localRouteScheduleTimepoint.month, month),
        ),
      )
      .run();
    insertAll(tx, localRouteScheduleTimepoint, values);
  });
}

export async function listRouteSchedules(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteScheduleTimepoint[]> {
  const rows = await db
    .select()
    .from(localRouteScheduleTimepoint)
    .where(
      and(
        eq(localRouteScheduleTimepoint.routeId, routeId),
        eq(localRouteScheduleTimepoint.month, month),
      ),
    )
    .orderBy(asc(localRouteScheduleTimepoint.rowRank));

  return rows.map((row) => {
    const output: LocalRouteScheduleTimepoint = {
      routeId: row.routeId,
      isoMonth: row.month,
      scheduleDate: row.scheduleDate,
      dayType: row.dayType,
      direction: row.direction,
      shapeId: row.shapeId,
      stopSequence: row.stopSequence,
      stopId: row.stopId,
      scheduleTime: row.scheduleTime,
      blockId: row.blockId,
    };

    if (row.stopName !== null) {
      output.stopName = row.stopName;
    }
    if (row.distanceFromStart !== null) {
      output.distanceFromStart = row.distanceFromStart;
    }
    if (row.tripHeadsign !== null) {
      output.tripHeadsign = row.tripHeadsign;
    }
    if (row.bundle !== null) {
      output.bundle = row.bundle;
    }

    return output;
  });
}

export function replaceRouteStops(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteStop[],
): void {
  const values = rows.map((row) => ({
    routeId: row.routeId,
    month: row.isoMonth,
    routeShortName: row.routeShortName,
    stopId: row.stopId,
    stopName: row.stopName,
    inEffect: row.inEffect,
    directionId: row.directionId,
    direction: row.direction,
    timepoint: row.timepoint,
    latitude: row.latitude,
    longitude: row.longitude,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteStop)
      .where(and(eq(localRouteStop.routeId, routeId), eq(localRouteStop.month, month)))
      .run();
    insertAll(tx, localRouteStop, values);
  });
}

export async function listRouteStops(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteStop[]> {
  const rows = await db
    .select()
    .from(localRouteStop)
    .where(and(eq(localRouteStop.routeId, routeId), eq(localRouteStop.month, month)))
    .orderBy(asc(localRouteStop.directionId), asc(localRouteStop.stopId));

  return rows.map((row) => ({
    routeId: row.routeId,
    isoMonth: row.month,
    routeShortName: row.routeShortName,
    stopId: row.stopId,
    stopName: row.stopName,
    inEffect: row.inEffect,
    directionId: row.directionId,
    direction: row.direction,
    timepoint: row.timepoint,
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

export function replaceRouteHotspots(
  db: LocalPipelineDb,
  summary: LocalRouteHotspotSummary,
  hotspots: readonly LocalRouteHotspot[],
): void {
  const hotspotValues = hotspots.map((hotspot, index) => ({
    routeId: hotspot.routeId,
    month: hotspot.isoMonth,
    hotspotRank: index + 1,
    segmentId: hotspot.segmentId,
    direction: hotspot.direction,
    stopOrder: hotspot.stopOrder,
    timepointStopId: hotspot.timepointStopId,
    timepointStopName: hotspot.timepointStopName,
    nextTimepointStopId: hotspot.nextTimepointStopId,
    nextTimepointStopName: hotspot.nextTimepointStopName,
    observationCount: hotspot.observationCount,
    busTripCount: hotspot.busTripCount,
    weightedAverageSpeedMph: hotspot.weightedAverageSpeedMph,
    weightedAverageTravelTimeMinutes: hotspot.weightedAverageTravelTimeMinutes,
    averageRoadDistanceMiles: hotspot.averageRoadDistanceMiles,
    slowWindowShare: hotspot.slowWindowShare,
    speedSeverity: hotspot.speedSeverity,
    hotspotScore: hotspot.hotspotScore,
    ridershipExposure: hotspot.ridershipExposure ?? null,
    transferExposure: hotspot.transferExposure ?? null,
    riderDelayIndex: hotspot.riderDelayIndex ?? null,
    riderImpactShare: hotspot.riderImpactShare ?? null,
    riderWeightedSpeedSeverity: hotspot.riderWeightedSpeedSeverity ?? null,
    riderWeightedSlowWindowShare: hotspot.riderWeightedSlowWindowShare ?? null,
    riderImpactScore: hotspot.riderImpactScore ?? null,
  }));

  db.transaction((tx) => {
    tx
      .delete(localRouteHotspot)
      .where(
        and(
          eq(localRouteHotspot.routeId, summary.routeId),
          eq(localRouteHotspot.month, summary.isoMonth),
        ),
      )
      .run();
    tx
      .delete(localRouteHotspotSummary)
      .where(
        and(
          eq(localRouteHotspotSummary.routeId, summary.routeId),
          eq(localRouteHotspotSummary.month, summary.isoMonth),
        ),
      )
      .run();

    tx
      .insert(localRouteHotspotSummary)
      .values({
        routeId: summary.routeId,
        month: summary.isoMonth,
        generatedAt: summary.generatedAt,
        routeWeightedAverageSpeedMph: summary.routeWeightedAverageSpeedMph,
        observationCount: summary.observationCount,
        busTripCount: summary.busTripCount,
        ridershipWeighted: summary.ridershipWeighted,
        ridershipWindowCount: summary.ridershipWindowCount,
        ridershipMatchedObservationCount: summary.ridershipMatchedObservationCount,
        ridershipExposure: summary.ridershipExposure,
        segmentCount: summary.segmentCount,
        hotspotCount: summary.hotspotCount,
      })
      .run();

    insertAll(tx, localRouteHotspot, hotspotValues);
  });
}

export async function getRouteHotspotSummary(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteHotspotSummary | null> {
  const row = await db
    .select()
    .from(localRouteHotspotSummary)
    .where(
      and(eq(localRouteHotspotSummary.routeId, routeId), eq(localRouteHotspotSummary.month, month)),
    )
    .get();

  if (row === undefined) {
    return null;
  }

  return {
    routeId: row.routeId,
    isoMonth: row.month,
    generatedAt: row.generatedAt,
    routeWeightedAverageSpeedMph: row.routeWeightedAverageSpeedMph,
    observationCount: row.observationCount,
    busTripCount: row.busTripCount,
    ridershipWeighted: row.ridershipWeighted,
    ridershipWindowCount: row.ridershipWindowCount,
    ridershipMatchedObservationCount: row.ridershipMatchedObservationCount,
    ridershipExposure: row.ridershipExposure,
    segmentCount: row.segmentCount,
    hotspotCount: row.hotspotCount,
  };
}

export async function listRouteHotspots(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalRouteHotspot[]> {
  const rows = await db
    .select()
    .from(localRouteHotspot)
    .where(and(eq(localRouteHotspot.routeId, routeId), eq(localRouteHotspot.month, month)))
    .orderBy(asc(localRouteHotspot.hotspotRank));

  return rows.map((row) => ({
    routeId: row.routeId,
    isoMonth: row.month,
    hotspotRank: row.hotspotRank,
    segmentId: row.segmentId,
    direction: row.direction,
    stopOrder: row.stopOrder,
    timepointStopId: row.timepointStopId,
    timepointStopName: row.timepointStopName,
    nextTimepointStopId: row.nextTimepointStopId,
    nextTimepointStopName: row.nextTimepointStopName,
    observationCount: row.observationCount,
    busTripCount: row.busTripCount,
    weightedAverageSpeedMph: row.weightedAverageSpeedMph,
    weightedAverageTravelTimeMinutes: row.weightedAverageTravelTimeMinutes,
    averageRoadDistanceMiles: row.averageRoadDistanceMiles,
    slowWindowShare: row.slowWindowShare,
    speedSeverity: row.speedSeverity,
    hotspotScore: row.hotspotScore,
    ridershipExposure: row.ridershipExposure ?? undefined,
    transferExposure: row.transferExposure ?? undefined,
    riderDelayIndex: row.riderDelayIndex ?? undefined,
    riderImpactShare: row.riderImpactShare ?? undefined,
    riderWeightedSpeedSeverity: row.riderWeightedSpeedSeverity ?? undefined,
    riderWeightedSlowWindowShare: row.riderWeightedSlowWindowShare ?? undefined,
    riderImpactScore: row.riderImpactScore ?? undefined,
  }));
}
