import * as z from "zod";
import type { D1DatabaseLike } from "./d1.js";
import { IsoMonthSchema } from "./serving-shared.js";

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
  })
  .strict();

const RouteBatchBuiltRouteRowSchema = z
  .object({
    month: IsoMonthSchema,
    route_rank: z.number().int().positive(),
    route_id: z.string().min(1),
    artifact_count: z.number().int().nonnegative().nullable(),
    status: z.string().min(1),
  })
  .strict();

const RouteBatchIssueRowSchema = z
  .object({
    month: IsoMonthSchema,
    issue_rank: z.number().int().positive(),
    route_id: z.string().nullable(),
    severity: z.enum(["error", "warning"]),
    issue_code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export type RouteBatchStatusRow = z.output<typeof RouteBatchStatusRowSchema>;
export type RouteBatchBuiltRouteRow = z.output<typeof RouteBatchBuiltRouteRowSchema>;
export type RouteBatchIssueRow = z.output<typeof RouteBatchIssueRowSchema>;

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
  builtRouteIds: string[];
  issues: string[];
};

function toRouteBatchStatus(
  row: RouteBatchStatusRow,
  builtRoutes: RouteBatchBuiltRouteRow[],
  issues: RouteBatchIssueRow[],
): RouteBatchStatus {
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
    builtRouteIds: builtRoutes.map((builtRoute) => builtRoute.route_id),
    issues: issues.map((issue) => issue.message),
  };
}

async function listBuiltRoutes(
  db: D1DatabaseLike,
  month: string,
): Promise<RouteBatchBuiltRouteRow[]> {
  const result = await db
    .prepare<RouteBatchBuiltRouteRow>(
      [
        "SELECT month, route_rank, route_id, artifact_count, status",
        "FROM route_batch_built_route",
        "WHERE month = ?",
        "ORDER BY route_rank ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) => RouteBatchBuiltRouteRowSchema.parse(row));
}

async function listIssues(db: D1DatabaseLike, month: string): Promise<RouteBatchIssueRow[]> {
  const result = await db
    .prepare<RouteBatchIssueRow>(
      [
        "SELECT month, issue_rank, route_id, severity, issue_code, message",
        "FROM route_batch_issue",
        "WHERE month = ?",
        "ORDER BY issue_rank ASC",
      ].join(" "),
    )
    .bind(month)
    .all();

  return (result.results ?? []).map((row) => RouteBatchIssueRowSchema.parse(row));
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
        "total_byte_length, issue_count",
        "FROM route_batch_status",
        "WHERE month = ?",
      ].join(" "),
    )
    .bind(month)
    .first();

  if (row === null) {
    return null;
  }

  const [builtRoutes, issues] = await Promise.all([
    listBuiltRoutes(db, month),
    listIssues(db, month),
  ]);

  return toRouteBatchStatus(RouteBatchStatusRowSchema.parse(row), builtRoutes, issues);
}
