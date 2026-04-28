import { asc, eq } from "drizzle-orm";
import * as z from "zod";
import type { D1ServingDb } from "../client.js";
import { routeBatchBuiltRoute, routeBatchIssue, routeBatchStatus } from "../schema.js";
import { IsoMonthSchema } from "./shared.js";

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

async function listBuiltRoutes(db: D1ServingDb, month: string): Promise<RouteBatchBuiltRouteRow[]> {
  const rows = await db
    .select({
      month: routeBatchBuiltRoute.month,
      route_rank: routeBatchBuiltRoute.routeRank,
      route_id: routeBatchBuiltRoute.routeId,
      artifact_count: routeBatchBuiltRoute.artifactCount,
      status: routeBatchBuiltRoute.status,
    })
    .from(routeBatchBuiltRoute)
    .where(eq(routeBatchBuiltRoute.month, month))
    .orderBy(asc(routeBatchBuiltRoute.routeRank));

  return rows.map((row) => RouteBatchBuiltRouteRowSchema.parse(row));
}

async function listIssues(db: D1ServingDb, month: string): Promise<RouteBatchIssueRow[]> {
  const rows = await db
    .select({
      month: routeBatchIssue.month,
      issue_rank: routeBatchIssue.issueRank,
      route_id: routeBatchIssue.routeId,
      severity: routeBatchIssue.severity,
      issue_code: routeBatchIssue.issueCode,
      message: routeBatchIssue.message,
    })
    .from(routeBatchIssue)
    .where(eq(routeBatchIssue.month, month))
    .orderBy(asc(routeBatchIssue.issueRank));

  return rows.map((row) => RouteBatchIssueRowSchema.parse(row));
}

export async function getRouteBatchStatus(
  db: D1ServingDb,
  month: string,
): Promise<RouteBatchStatus | null> {
  const rows = await db
    .select({
      month: routeBatchStatus.month,
      generated_at: routeBatchStatus.generatedAt,
      status: routeBatchStatus.status,
      route_count: routeBatchStatus.routeCount,
      artifact_count: routeBatchStatus.artifactCount,
      missing_artifact_count: routeBatchStatus.missingArtifactCount,
      hash_mismatch_count: routeBatchStatus.hashMismatchCount,
      byte_length_mismatch_count: routeBatchStatus.byteLengthMismatchCount,
      total_byte_length: routeBatchStatus.totalByteLength,
      issue_count: routeBatchStatus.issueCount,
    })
    .from(routeBatchStatus)
    .where(eq(routeBatchStatus.month, month))
    .limit(1);
  const row = rows[0] ?? null;

  if (row === null) {
    return null;
  }

  const [builtRoutes, issues] = await Promise.all([
    listBuiltRoutes(db, month),
    listIssues(db, month),
  ]);

  return toRouteBatchStatus(RouteBatchStatusRowSchema.parse(row), builtRoutes, issues);
}
