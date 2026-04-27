import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema, parseJsonField } from "./serving-shared.js";

const RouteBatchStatusRowSchema = z
  .object({
    month: IsoMonthSchema,
    generated_at: z.string().min(1),
    status: z.enum(["pass", "fail"]),
    route_count: z.number().int().nonnegative(),
    artifact_count: z.number().int().nonnegative(),
    missing_artifact_count: z.number().int().nonnegative(),
    hash_mismatch_count: z.number().int().nonnegative(),
    byte_length_mismatch_count: z.number().int().nonnegative(),
    total_byte_length: z.number().int().nonnegative(),
    issue_count: z.number().int().nonnegative(),
    built_route_ids_json: z.string(),
    issues_json: z.string(),
  })
  .strict();

export type RouteBatchStatusRow = z.output<typeof RouteBatchStatusRowSchema>;

export type RouteBatchStatus = {
  month: string;
  generatedAt: string;
  status: RouteBatchStatusRow["status"];
  routeCount: number;
  artifactCount: number;
  missingArtifactCount: number;
  hashMismatchCount: number;
  byteLengthMismatchCount: number;
  totalByteLength: number;
  issueCount: number;
  builtRouteIds: unknown;
  issues: unknown;
};

function toRouteBatchStatus(row: RouteBatchStatusRow): RouteBatchStatus {
  return {
    month: row.month,
    generatedAt: row.generated_at,
    status: row.status,
    routeCount: row.route_count,
    artifactCount: row.artifact_count,
    missingArtifactCount: row.missing_artifact_count,
    hashMismatchCount: row.hash_mismatch_count,
    byteLengthMismatchCount: row.byte_length_mismatch_count,
    totalByteLength: row.total_byte_length,
    issueCount: row.issue_count,
    builtRouteIds: parseJsonField(row.built_route_ids_json),
    issues: parseJsonField(row.issues_json),
  };
}

export async function getRouteBatchStatus(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteBatchStatus | null> {
  const row = await db
    .prepare<RouteBatchStatusRow>(
      [
        "SELECT month, generated_at, status, route_count, artifact_count,",
        "missing_artifact_count, hash_mismatch_count, byte_length_mismatch_count,",
        "total_byte_length, issue_count, built_route_ids_json, issues_json",
        "FROM route_batch_status",
        "WHERE month = ?",
      ].join(" "),
    )
    .bind(month)
    .first();

  return row === null ? null : toRouteBatchStatus(RouteBatchStatusRowSchema.parse(row));
}
