import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { corridorArtifact, routeArtifact } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteArtifactRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    artifact_name: z.string().min(1),
    artifact_key: z.string().min(1),
    content_type: z.string().min(1),
    byte_length: z.number().int().nonnegative(),
    sha256: z.string().length(64),
  })
  .strict();

const CorridorArtifactRowSchema = z
  .object({
    corridor_id: z.string().min(1),
    month: IsoMonthSchema,
    artifact_name: z.string().min(1),
    artifact_key: z.string().min(1),
    content_type: z.string().min(1),
    byte_length: z.number().int().nonnegative(),
    sha256: z.string().length(64),
  })
  .strict();

export type RouteArtifactRow = z.output<typeof RouteArtifactRowSchema>;
export type CorridorArtifactRow = z.output<typeof CorridorArtifactRowSchema>;

export async function listRouteArtifacts(
  db: D1ServingDb,
  month: string,
): Promise<RouteArtifactRow[]> {
  const rows = await db
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

  return rows.map((row) => RouteArtifactRowSchema.parse(row));
}

export async function listCorridorArtifacts(
  db: D1ServingDb,
  month: string,
): Promise<CorridorArtifactRow[]> {
  const rows = await db
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

  return rows.map((row) => CorridorArtifactRowSchema.parse(row));
}
