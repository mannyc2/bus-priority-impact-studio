import { asc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { corridorArtifact, routeArtifact } from "../schema.js";

async function selectRouteArtifactRows(db: D1ServingDb, month: string) {
  return db
    .select({
      route_id: routeArtifact.routeId,
      month: routeArtifact.month,
      artifact_name: routeArtifact.artifactName,
      artifact_key: routeArtifact.artifactKey,
      content_type: routeArtifact.contentType,
      byte_length: routeArtifact.byteLength,
      sha256: routeArtifact.sha256,
    })
    .from(routeArtifact)
    .where(eq(routeArtifact.month, month))
    .orderBy(asc(routeArtifact.routeId), asc(routeArtifact.artifactName));
}

async function selectCorridorArtifactRows(db: D1ServingDb, month: string) {
  return db
    .select({
      corridor_id: corridorArtifact.corridorId,
      month: corridorArtifact.month,
      artifact_name: corridorArtifact.artifactName,
      artifact_key: corridorArtifact.artifactKey,
      content_type: corridorArtifact.contentType,
      byte_length: corridorArtifact.byteLength,
      sha256: corridorArtifact.sha256,
    })
    .from(corridorArtifact)
    .where(eq(corridorArtifact.month, month))
    .orderBy(asc(corridorArtifact.corridorId), asc(corridorArtifact.artifactName));
}

export type RouteArtifactRow = Awaited<ReturnType<typeof selectRouteArtifactRows>>[number];
export type CorridorArtifactRow = Awaited<ReturnType<typeof selectCorridorArtifactRows>>[number];

export async function listRouteArtifacts(
  db: D1ServingDb,
  month: string,
): Promise<RouteArtifactRow[]> {
  return selectRouteArtifactRows(db, month);
}

export async function listCorridorArtifacts(
  db: D1ServingDb,
  month: string,
): Promise<CorridorArtifactRow[]> {
  return selectCorridorArtifactRows(db, month);
}
