import { and, asc, eq } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
import {
  localAceRoute,
  localAceViolationSummary,
  localBusLane,
  localBusLaneCoordinate,
  localInterventionEvent,
  localRouteInterventionComparison,
} from "../schema.js";

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

export type LocalAceRoute = {
  routeId: string;
  program: "ABLE" | "ACE";
  implementationDate: string;
};

export type LocalAceViolationSummary = {
  month: string;
  routeId: string;
  violationType: string;
  violationStatus: string;
  violationCount: number;
};

export type LocalInterventionEvent = typeof localInterventionEvent.$inferSelect;
export type LocalRouteInterventionComparison = typeof localRouteInterventionComparison.$inferSelect;

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

export function replaceBusLanes(db: LocalPipelineDb, rows: readonly LocalBusLane[]): void {
  // Deduplicate by segmentId — Socrata source can have multiple rows per segment.
  const deduped = [...new Map(rows.map((row) => [row.segmentId, row])).values()];

  const laneValues = deduped.map((row) => ({
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
  }));

  const coordinates = deduped.flatMap((row) =>
    row.coordinates.map((coordinate, index) => ({
      segmentId: row.segmentId,
      coordinateRank: index + 1,
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
    })),
  );

  db.transaction((tx) => {
    tx.delete(localBusLaneCoordinate).run();
    tx.delete(localBusLane).run();
    insertAll(tx, localBusLane, laneValues);
    insertAll(tx, localBusLaneCoordinate, coordinates);
  });
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

export function replaceAceRoutes(db: LocalPipelineDb, rows: readonly LocalAceRoute[]): void {
  db.transaction((tx) => {
    tx.delete(localAceRoute).run();
    insertAll(tx, localAceRoute, [...rows]);
  });
}

export async function listAceRoutesForRoute(
  db: LocalPipelineDb,
  routeId: string,
): Promise<LocalAceRoute[]> {
  return db
    .select()
    .from(localAceRoute)
    .where(eq(localAceRoute.routeId, routeId))
    .orderBy(asc(localAceRoute.implementationDate), asc(localAceRoute.program));
}

export async function listAceRoutes(db: LocalPipelineDb): Promise<LocalAceRoute[]> {
  return db
    .select()
    .from(localAceRoute)
    .orderBy(asc(localAceRoute.routeId), asc(localAceRoute.implementationDate));
}

export function replaceAceViolationSummaries(
  db: LocalPipelineDb,
  month: string,
  rows: readonly LocalAceViolationSummary[],
): void {
  db.transaction((tx) => {
    tx.delete(localAceViolationSummary).where(eq(localAceViolationSummary.month, month)).run();
    insertAll(tx, localAceViolationSummary, [...rows]);
  });
}

export async function listAceViolationSummariesForRoute(
  db: LocalPipelineDb,
  routeId: string,
  month: string,
): Promise<LocalAceViolationSummary[]> {
  return db
    .select()
    .from(localAceViolationSummary)
    .where(
      and(eq(localAceViolationSummary.routeId, routeId), eq(localAceViolationSummary.month, month)),
    )
    .orderBy(
      asc(localAceViolationSummary.violationType),
      asc(localAceViolationSummary.violationStatus),
    );
}

export function replaceRouteInterventionEvaluationRows(
  db: LocalPipelineDb,
  month: string,
  sourceId: string,
  input: {
    events: readonly (typeof localInterventionEvent.$inferInsert)[];
    comparisons: readonly (typeof localRouteInterventionComparison.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx
      .delete(localRouteInterventionComparison)
      .where(
        and(
          eq(localRouteInterventionComparison.month, month),
          eq(localRouteInterventionComparison.sourceId, sourceId),
        ),
      )
      .run();
    tx.delete(localInterventionEvent).where(eq(localInterventionEvent.sourceId, sourceId)).run();

    insertAll(tx, localInterventionEvent, [...input.events]);
    insertAll(tx, localRouteInterventionComparison, [...input.comparisons]);
  });
}

export async function listInterventionEvents(
  db: LocalPipelineDb,
): Promise<LocalInterventionEvent[]> {
  return db
    .select()
    .from(localInterventionEvent)
    .orderBy(asc(localInterventionEvent.routeId), asc(localInterventionEvent.implementationDate));
}

export async function listRouteInterventionComparisons(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteInterventionComparison[]> {
  return db
    .select()
    .from(localRouteInterventionComparison)
    .where(eq(localRouteInterventionComparison.month, month))
    .orderBy(
      asc(localRouteInterventionComparison.routeId),
      asc(localRouteInterventionComparison.eventId),
    );
}
