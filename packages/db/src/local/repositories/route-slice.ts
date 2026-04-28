import { and, asc, eq } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import { localRouteHourlyRidership, localRouteSegmentSpeed } from "../schema.js";

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

export type LocalRouteHourlyRidership = {
  routeId: string;
  isoMonth: string;
  dayOfWeek: string;
  hourOfDay: number;
  ridership: number;
  transfers: number;
};

export async function replaceRouteSegmentSpeeds(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteSegmentSpeed[],
): Promise<void> {
  await db
    .delete(localRouteSegmentSpeed)
    .where(
      and(eq(localRouteSegmentSpeed.routeId, routeId), eq(localRouteSegmentSpeed.month, month)),
    );

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteSegmentSpeed).values(
    rows.map((row, index) => ({
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
    })),
  );
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

export async function replaceRouteHourlyRidership(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
  rows: readonly LocalRouteHourlyRidership[],
): Promise<void> {
  await db
    .delete(localRouteHourlyRidership)
    .where(
      and(
        eq(localRouteHourlyRidership.routeId, routeId),
        eq(localRouteHourlyRidership.month, month),
      ),
    );

  if (rows.length === 0) {
    return;
  }

  await db.insert(localRouteHourlyRidership).values(
    rows.map((row) => ({
      routeId: row.routeId,
      month: row.isoMonth,
      dayOfWeek: row.dayOfWeek,
      hourOfDay: row.hourOfDay,
      ridership: row.ridership,
      transfers: row.transfers,
    })),
  );
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
