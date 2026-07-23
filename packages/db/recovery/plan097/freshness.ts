import { Schema } from "effect";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const IsoMonthSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/u));
const CanonicalTimestampSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);

export const plan097FreshnessSourceIds = [
  "bus_segment_speeds_2025",
  "bus_hourly_ridership_2025",
  "bus_wait_assessment",
  "ace_violations",
  "ace_routes",
  "nyc_dot_bus_lanes_local_streets",
  "bus_time_gtfsrt_vehicle_positions",
] as const;

export const Plan097FreshnessEvidenceSchema = Schema.Struct({
  sourceId: Schema.Literals(plan097FreshnessSourceIds),
  partition: Schema.String.check(Schema.isMinLength(1)),
  rowCount: NonNegativeIntegerSchema,
  routeCount: Schema.NullOr(NonNegativeIntegerSchema),
  rowsSha256: Sha256Schema,
  sourceSnapshotSha256: Schema.NullOr(Sha256Schema),
});

export const Plan097FreshnessDatasetSchema = Schema.Struct({
  sourceId: Schema.Literals(plan097FreshnessSourceIds),
  grain: Schema.Literals(["month", "snapshot", "realtime"]),
  selectionBasis: Schema.Literals([
    "source_complete_probe",
    "latest_closed_upstream_month",
    "atomic_snapshot",
    "preserved_current_signal",
  ]),
  upstreamLatest: Schema.NullOr(Schema.String),
  selectedCompletePartition: Schema.NullOr(Schema.String),
  ingestedLatest: Schema.NullOr(Schema.String),
  evidence: Schema.NullOr(Plan097FreshnessEvidenceSchema),
  status: Schema.Literals(["ready", "stop"]),
  reasons: Schema.Array(Schema.String),
});

export const Plan097FreshnessMatrixSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.freshness-matrix.v1"),
  schemaVersion: Schema.Literal(1),
  checkedAt: CanonicalTimestampSchema,
  status: Schema.Literals(["ready", "stop"]),
  candidateCompatibilityCoverageEnd: Schema.NullOr(IsoMonthSchema),
  datasets: Schema.Array(Plan097FreshnessDatasetSchema),
}).check(
  Schema.makeFilter((matrix) => {
    const issues: Array<{ path: ReadonlyArray<string | number>; issue: string }> = [];
    const sourceIds = matrix.datasets.map((dataset) => dataset.sourceId);
    if (
      sourceIds.length !== plan097FreshnessSourceIds.length ||
      new Set(sourceIds).size !== sourceIds.length ||
      plan097FreshnessSourceIds.some((sourceId) => !sourceIds.includes(sourceId))
    ) {
      issues.push({
        path: ["datasets"],
        issue: "Freshness matrix must contain each Plan 097 critical source exactly once",
      });
    }
    for (const [index, dataset] of matrix.datasets.entries()) {
      if (dataset.evidence !== null && dataset.evidence.sourceId !== dataset.sourceId) {
        issues.push({
          path: ["datasets", index, "evidence", "sourceId"],
          issue: "Freshness evidence source must match its dataset",
        });
      }
    }
    if (matrix.status === "ready") {
      if (matrix.candidateCompatibilityCoverageEnd === null) {
        issues.push({
          path: ["candidateCompatibilityCoverageEnd"],
          issue: "Ready matrix requires the route-speed compatibility coverage end",
        });
      }
      for (const [index, dataset] of matrix.datasets.entries()) {
        if (
          dataset.status !== "ready" ||
          dataset.reasons.length !== 0 ||
          dataset.selectedCompletePartition === null ||
          dataset.evidence === null ||
          dataset.evidence.rowCount === 0
        ) {
          issues.push({
            path: ["datasets", index],
            issue: "Ready matrix requires nonempty, reason-free evidence for every dataset",
          });
        }
      }
    }
    return issues;
  }),
);

export type Plan097FreshnessEvidence = typeof Plan097FreshnessEvidenceSchema.Type;
export type Plan097FreshnessDataset = typeof Plan097FreshnessDatasetSchema.Type;
export type Plan097FreshnessMatrix = typeof Plan097FreshnessMatrixSchema.Type;
