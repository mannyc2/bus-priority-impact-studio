import { asc } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import { localBusLane, localBusLaneCoordinate } from "../schema.js";

export type LocalBusLaneCoordinate = {
  longitude: number;
  latitude: number;
};

export type LocalBusLane = {
  segmentId: string;
  street: string;
  borough: string;
  facility: string;
  direction?: string | undefined;
  trafficDirection?: string | undefined;
  hours?: string | undefined;
  days?: string | undefined;
  laneType?: string | undefined;
  laneSubtype?: string | undefined;
  laneWidth?: string | undefined;
  openDate?: string | undefined;
  shapeLength?: number | undefined;
  coordinates: LocalBusLaneCoordinate[];
};

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function collectCoordinates(value: unknown, output: LocalBusLaneCoordinate[] = []) {
  if (isCoordinate(value)) {
    output.push({ longitude: value[0], latitude: value[1] });
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCoordinates(item, output);
    }
  }

  return output;
}

export function geometryCoordinates(geometry: unknown): LocalBusLaneCoordinate[] {
  if (geometry === undefined || geometry === null || typeof geometry !== "object") {
    return [];
  }

  return collectCoordinates((geometry as { coordinates?: unknown }).coordinates);
}

export async function replaceBusLanes(
  db: LocalPipelineDb,
  rows: readonly LocalBusLane[],
): Promise<void> {
  await db.delete(localBusLaneCoordinate);
  await db.delete(localBusLane);

  if (rows.length === 0) {
    return;
  }

  await db.insert(localBusLane).values(
    rows.map((row) => ({
      segmentId: row.segmentId,
      street: row.street,
      borough: row.borough,
      facility: row.facility,
      direction: row.direction ?? null,
      trafficDirection: row.trafficDirection ?? null,
      hours: row.hours ?? null,
      days: row.days ?? null,
      laneType: row.laneType ?? null,
      laneSubtype: row.laneSubtype ?? null,
      laneWidth: row.laneWidth ?? null,
      openDate: row.openDate ?? null,
      shapeLength: row.shapeLength ?? null,
    })),
  );

  const coordinates = rows.flatMap((row) =>
    row.coordinates.map((coordinate, index) => ({
      segmentId: row.segmentId,
      coordinateRank: index + 1,
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
    })),
  );

  if (coordinates.length > 0) {
    await db.insert(localBusLaneCoordinate).values(coordinates);
  }
}

export async function listBusLanes(db: LocalPipelineDb): Promise<LocalBusLane[]> {
  const [lanes, coordinates] = await Promise.all([
    db.select().from(localBusLane).orderBy(asc(localBusLane.street), asc(localBusLane.segmentId)),
    db
      .select()
      .from(localBusLaneCoordinate)
      .orderBy(asc(localBusLaneCoordinate.segmentId), asc(localBusLaneCoordinate.coordinateRank)),
  ]);
  const coordinatesBySegment = new Map<string, LocalBusLaneCoordinate[]>();

  for (const coordinate of coordinates) {
    const group = coordinatesBySegment.get(coordinate.segmentId) ?? [];
    group.push({ longitude: coordinate.longitude, latitude: coordinate.latitude });
    coordinatesBySegment.set(coordinate.segmentId, group);
  }

  return lanes.map((row) => ({
    segmentId: row.segmentId,
    street: row.street,
    borough: row.borough,
    facility: row.facility,
    direction: row.direction ?? undefined,
    trafficDirection: row.trafficDirection ?? undefined,
    hours: row.hours ?? undefined,
    days: row.days ?? undefined,
    laneType: row.laneType ?? undefined,
    laneSubtype: row.laneSubtype ?? undefined,
    laneWidth: row.laneWidth ?? undefined,
    openDate: row.openDate ?? undefined,
    shapeLength: row.shapeLength ?? undefined,
    coordinates: coordinatesBySegment.get(row.segmentId) ?? [],
  }));
}
