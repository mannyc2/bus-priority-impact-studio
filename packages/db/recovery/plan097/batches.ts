import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { Plan097FreshnessMatrixSchema } from "./freshness.js";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));

export const plan097RecoveryMutationTables = [
  "corridor",
  "corridor_artifact",
  "corridor_hotspot",
  "corridor_intervention_context",
  "corridor_month_summary",
  "corridor_route_member",
  "intervention_event",
  "route_artifact",
  "route_batch_built_route",
  "route_batch_issue",
  "route_batch_status",
  "route_brief_peak_window",
  "route_brief_slowest_window",
  "route_brief_summary",
  "route_build_plan",
  "route_catalog",
  "route_catalog_trip_type",
  "route_catalog_type",
  "route_comparison_rank",
  "route_direction",
  "route_equity_context",
  "route_intervention_comparison",
  "route_month_coverage",
  "route_month_source_status",
  "route_month_trend",
  "route_readiness",
  "route_readiness_missing_input",
  "route_reliability_baseline",
  "route_reliability_gap_window",
  "route_scorecard",
  "route_speed_history_coverage",
  "route_timeline_index",
  "source_month_coverage",
] as const;

export const Plan097BatchStatementSchema = Schema.Struct({
  sql: Schema.String.check(Schema.isMinLength(1)),
  params: Schema.Array(Schema.String),
  table: Schema.String.check(Schema.isMinLength(1)),
  kind: Schema.Literals(["delete", "insert", "registration", "activation"]),
  rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

const Plan097BatchMetricsSchema = Schema.Struct({
  originalStatementCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  compactedStatementCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  sqlBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  parameterBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  maxParametersPerStatement: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
});

export const Plan097CompactedBatchSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  statements: Schema.Array(Plan097BatchStatementSchema),
  metrics: Plan097BatchMetricsSchema,
}).check(
  Schema.makeFilter((batch) => {
    const issues: Array<{ path: ReadonlyArray<string | number>; issue: string }> = [];
    const mutationTables = new Set<string>(plan097RecoveryMutationTables);
    const registrationTables = new Set(["exact_route_identity_release", "map_release_catalog"]);
    if (batch.statements.length === 0 || batch.statements.length > 1_000) {
      issues.push({ path: ["statements"], issue: "Batch must contain 1-1,000 statements" });
    }
    let activationStarted = false;
    for (const [index, statement] of batch.statements.entries()) {
      const target = statement.sql.match(
        /\b(?:delete\s+from|insert\s+into)\s+[`"]?([a-z0-9_]+)/iu,
      )?.[1];
      const allowedKind =
        (statement.kind === "delete" &&
          (mutationTables.has(statement.table) || registrationTables.has(statement.table))) ||
        (statement.kind === "insert" && mutationTables.has(statement.table)) ||
        (statement.kind === "registration" && registrationTables.has(statement.table)) ||
        (statement.kind === "activation" && statement.table === "route_batch_status");
      if (!allowedKind || target !== statement.table) {
        issues.push({
          path: ["statements", index],
          issue: "Statement target or kind is outside the Plan 097 allowlist",
        });
      }
      if (statement.kind === "activation") activationStarted = true;
      else if (activationStarted) {
        issues.push({
          path: ["statements", index],
          issue: "Only activation statements may follow the first activation statement",
        });
      }
      if (statement.params.length > 100) {
        issues.push({ path: ["statements", index, "params"], issue: "Too many bound parameters" });
      }
      if (new TextEncoder().encode(statement.sql).byteLength > 100_000) {
        issues.push({ path: ["statements", index, "sql"], issue: "Statement exceeds 100 KB" });
      }
    }
    const finalStatement = batch.statements.at(-1);
    if (finalStatement?.kind !== "activation" || finalStatement.table !== "route_batch_status") {
      issues.push({
        path: ["statements"],
        issue: "The absolute final statement must activate route_batch_status",
      });
    }
    const sqlBytes = batch.statements.reduce(
      (sum, statement) => sum + new TextEncoder().encode(statement.sql).byteLength,
      0,
    );
    const parameterBytes = batch.statements.reduce(
      (sum, statement) =>
        sum +
        statement.params.reduce(
          (parameterSum, parameter) =>
            parameterSum + new TextEncoder().encode(parameter).byteLength,
          0,
        ),
      0,
    );
    const rowCount = batch.statements.reduce((sum, statement) => sum + statement.rowCount, 0);
    const maxParametersPerStatement = Math.max(
      0,
      ...batch.statements.map((statement) => statement.params.length),
    );
    if (
      batch.metrics.compactedStatementCount !== batch.statements.length ||
      batch.metrics.sqlBytes !== sqlBytes ||
      batch.metrics.parameterBytes !== parameterBytes ||
      batch.metrics.rowCount !== rowCount ||
      batch.metrics.maxParametersPerStatement !== maxParametersPerStatement
    ) {
      issues.push({ path: ["metrics"], issue: "Batch metrics do not match structured statements" });
    }
    return issues;
  }),
);

const Plan097BundleSourceSchema = Schema.Struct({
  kind: Schema.Literals([
    "canonical-schema",
    "recovery-seed",
    "exact-route-registration",
    "map-release-registration",
  ]),
  sha256: Sha256Schema,
  byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const Plan097ActivationBundleSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.activation-bundle.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
  freshnessMatrix: Plan097FreshnessMatrixSchema,
  expectedExactRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  schemaEnvelope: Schema.Struct({
    canonicalSnapshotSha256: Sha256Schema,
    structuralSha256: Sha256Schema,
  }),
  artifactManifest: Schema.Struct({
    key: Schema.String.check(
      Schema.isPattern(/^operations\/plan097\/releases\/pub_[0-9TZ]+\/artifact-manifest\.json$/u),
    ),
    sha256: Sha256Schema,
    byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    entryCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  }),
  sources: Schema.Array(Plan097BundleSourceSchema).check(Schema.isLengthBetween(4, 4)),
  batch: Plan097CompactedBatchSchema,
});

export const Plan097ActivationBundleReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.activation-bundle-receipt.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
  freshnessMatrix: Plan097FreshnessMatrixSchema,
  bundle: Schema.Struct({
    key: Schema.String.check(
      Schema.isPattern(
        /^operations\/plan097\/bundles\/pub_[0-9TZ]+\/activation\.[a-f0-9]{64}\.json$/u,
      ),
    ),
    sha256: Sha256Schema,
    byteLength: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  }),
  metrics: Plan097BatchMetricsSchema,
});

export type Plan097BatchStatement = typeof Plan097BatchStatementSchema.Type;
export type Plan097CompactedBatch = typeof Plan097CompactedBatchSchema.Type;
export type Plan097ActivationBundle = typeof Plan097ActivationBundleSchema.Type;
export type Plan097ActivationBundleReceipt = typeof Plan097ActivationBundleReceiptSchema.Type;

export function canonicalPlan097Json(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPlan097Json).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalPlan097Json(entry)}`)
    .join(",")}}`;
}
