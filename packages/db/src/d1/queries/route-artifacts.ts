import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeArtifact } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

const RouteArtifactRowSchema = z
  .object({
    route_id: z.string().min(1),
    month: IsoMonthSchema,
    artifact_name: z.string().min(1),
    artifact_key: z.string().min(1),
    content_type: z.string().min(1),
    byte_length: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export type RouteArtifactRow = z.output<typeof RouteArtifactRowSchema>;

export type RouteArtifact = {
  routeId: string;
  month: string;
  artifactName: string;
  artifactKey: string;
  contentType: string;
  byteLength: number;
  sha256: string;
};

function toRouteArtifact(row: RouteArtifactRow): RouteArtifact {
  return {
    routeId: row.route_id,
    month: row.month,
    artifactName: row.artifact_name,
    artifactKey: row.artifact_key,
    contentType: row.content_type,
    byteLength: row.byte_length,
    sha256: row.sha256,
  };
}

export async function listRouteArtifacts(
  db: D1ServingDb,
  routeId: string,
  month: string,
): Promise<RouteArtifact[]> {
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
    .where(and(eq(routeArtifact.routeId, routeId), eq(routeArtifact.month, month)))
    .orderBy(asc(routeArtifact.artifactName));

  return rows.map((row) => toRouteArtifact(RouteArtifactRowSchema.parse(row)));
}
