import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema } from "./serving-shared.js";

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
  db: D1DatabaseLike,
  routeId: string,
  month: string,
): Promise<RouteArtifact[]> {
  const result = await db
    .prepare<RouteArtifactRow>(
      [
        "SELECT route_id, month, artifact_name, artifact_key, content_type, byte_length, sha256",
        "FROM route_artifact",
        "WHERE route_id = ? AND month = ?",
        "ORDER BY artifact_name ASC",
      ].join(" "),
    )
    .bind(routeId, month)
    .all();

  return (result.results ?? []).map((row) => toRouteArtifact(RouteArtifactRowSchema.parse(row)));
}
