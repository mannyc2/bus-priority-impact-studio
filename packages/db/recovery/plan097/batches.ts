import { ReleaseIdentitySchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";

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
});

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
  sources: Schema.Array(Plan097BundleSourceSchema).check(Schema.isLengthBetween(4, 4)),
  batch: Plan097CompactedBatchSchema,
});

export const Plan097ActivationBundleReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.activation-bundle-receipt.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
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
