import { ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const OperationIdSchema = Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const NonNegativeFiniteSchema = Schema.Number.check(Schema.isFinite()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const BaseFields = {
  operationId: OperationIdSchema,
  activationBundleSha256: Sha256Schema,
};

export const Plan097HttpEndpointEvidenceSchema = Schema.Struct({
  path: Schema.String.check(Schema.isPattern(/^\//u)),
  status: NonNegativeIntegerSchema.check(Schema.isLessThanOrEqualTo(599)),
  schemaId: Schema.String.check(Schema.isMinLength(1)),
  safeBodySha256: Sha256Schema,
  requestId: Schema.NullOr(Schema.String),
  cfRay: Schema.NullOr(Schema.String),
  cacheControl: Schema.NullOr(Schema.String),
  etag: Schema.NullOr(Schema.String),
});

export const Plan097HttpBaselineSchema = Schema.Struct({
  checkedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  activeReleaseId: ReleaseIdSchema,
  endpoints: Schema.Array(Plan097HttpEndpointEvidenceSchema).check(Schema.isNonEmpty()),
}).check(
  Schema.makeFilter((baseline) => {
    const paths = baseline.endpoints.map((endpoint) => endpoint.path);
    if (new Set(paths).size !== paths.length) {
      return [{ path: ["endpoints"], issue: "HTTP baseline endpoint paths must be unique" }];
    }
    const status = baseline.endpoints.find(
      (endpoint) =>
        endpoint.path === "/api/v1/status" || endpoint.path.startsWith("/api/v1/status?"),
    );
    if (status === undefined || status.status !== 200) {
      return [{ path: ["endpoints"], issue: "The preflight status endpoint must pass" }];
    }
    const cacheable = baseline.endpoints.find(
      (endpoint) => endpoint.status < 500 && endpoint.cacheControl !== "no-store",
    );
    if (cacheable !== undefined) {
      return [
        {
          path: ["endpoints"],
          issue: `The Plan 097 cache bypass is missing for ${cacheable.path}`,
        },
      ];
    }
    return [];
  }),
);

export const Plan097OperationMetricsSchema = Schema.Struct({
  scope: Schema.Literal("operation-before-receipt-persistence"),
  durationMs: NonNegativeFiniteSchema,
  d1: Schema.Struct({
    statementCount: NonNegativeIntegerSchema,
    rowsRead: NonNegativeIntegerSchema,
    rowsWritten: NonNegativeIntegerSchema,
    queryDurationMs: NonNegativeFiniteSchema,
  }),
  r2: Schema.Struct({
    headRequests: NonNegativeIntegerSchema,
    getRequests: NonNegativeIntegerSchema,
    putRequests: NonNegativeIntegerSchema,
    bytesRead: NonNegativeIntegerSchema,
    bytesWritten: NonNegativeIntegerSchema,
  }),
});

export const Plan097OperationUsageSchema = Schema.Struct({
  scope: Schema.Literal("aggregate-of-operation-before-receipt-persistence"),
  operationCount: NonNegativeIntegerSchema,
  durationMs: NonNegativeFiniteSchema,
  d1: Schema.Struct({
    statementCount: NonNegativeIntegerSchema,
    rowsRead: NonNegativeIntegerSchema,
    rowsWritten: NonNegativeIntegerSchema,
    queryDurationMs: NonNegativeFiniteSchema,
  }),
  r2: Schema.Struct({
    headRequests: NonNegativeIntegerSchema,
    getRequests: NonNegativeIntegerSchema,
    putRequests: NonNegativeIntegerSchema,
    bytesRead: NonNegativeIntegerSchema,
    bytesWritten: NonNegativeIntegerSchema,
  }),
});

const Plan097OperationActionSchema = Schema.Literals([
  "seed-bundle",
  "dry-run",
  "preflight",
  "mirror-bundle",
  "reconcile-schema",
  "stage-body",
  "seed-proof-alias",
  "finalize-manifest",
  "activate",
  "prove",
  "rollback",
  "record-proof",
  "record-completion",
]);

const Plan097ReceiptKeySchema = Schema.String.check(
  Schema.isPattern(/^operations\/plan097\/receipts\/pub_[0-9TZ]+\/[a-z-]+\.[a-f0-9]{64}\.json$/u),
);

export const Plan097EvidenceRefSchema = Schema.Struct({
  kind: Schema.Literals([
    "selective-snapshot",
    "restore-bundle",
    "preflight",
    "proof-summary",
    "completion",
  ]),
  key: Schema.String.check(Schema.isPattern(/^operations\/plan097\/[A-Za-z0-9+._/-]+$/u)),
  sha256: Sha256Schema,
  bytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
});

export const Plan097ProofHttpComparisonSchema = Schema.Struct({
  phase: Schema.Literals([
    "proof-baseline",
    "injected-failure",
    "candidate-active",
    "baseline-restored",
  ]),
  baseline: Plan097HttpBaselineSchema,
});

export const Plan097ProductionHttpComparisonSchema = Schema.Struct({
  phase: Schema.Literals(["production-baseline", "production-active", "baseline-restored"]),
  baseline: Plan097HttpBaselineSchema,
});

export const Plan097OperationReceiptSetSchema = Schema.Struct({
  receiptCount: NonNegativeIntegerSchema,
  sortedKeysSha256: Sha256Schema,
  usage: Plan097OperationUsageSchema,
});

export const Plan097OperationRequestSchema = Schema.Union([
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("seed-bundle"),
    activationBundleBase64: Schema.String.check(Schema.isMinLength(1)),
    artifactManifestBase64: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("dry-run") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("preflight"),
    httpBaseline: Plan097HttpBaselineSchema,
  }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("mirror-bundle") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("reconcile-schema"),
    preflightReceiptSha256: Sha256Schema,
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("stage-body"),
    logicalId: Schema.String.check(Schema.isMinLength(1)),
    declaredSha256: Sha256Schema,
    declaredBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    mediaType: Schema.String.check(Schema.isMinLength(1)),
    bodyBase64: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("seed-proof-alias"),
    logicalId: Schema.String.check(Schema.isMinLength(1)),
    declaredSha256: Sha256Schema,
    declaredBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    mediaType: Schema.String.check(Schema.isMinLength(1)),
    bodyBase64: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("finalize-manifest") }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("activate") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("prove"),
    bundle: Schema.Literals(["activation", "restore"]),
    restoreBundleSha256: Sha256Schema,
    failBeforeStatement: Schema.optionalKey(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("rollback"),
    restoreBundleSha256: Sha256Schema,
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("record-proof"),
    restoreBundleSha256: Sha256Schema,
    receiptKeys: Schema.Array(Plan097ReceiptKeySchema).check(Schema.isNonEmpty()),
    receiptSet: Plan097OperationReceiptSetSchema,
    httpComparisons: Schema.Array(Plan097ProofHttpComparisonSchema).check(Schema.isNonEmpty()),
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("record-completion"),
    outcome: Schema.Literals(["active", "rolled_back"]),
    preflightReceiptSha256: Sha256Schema,
    restoreBundleSha256: Sha256Schema,
    proofSummary: Plan097EvidenceRefSchema,
    receiptKeys: Schema.Array(Plan097ReceiptKeySchema).check(Schema.isNonEmpty()),
    receiptSet: Plan097OperationReceiptSetSchema,
    httpComparisons: Schema.Array(Plan097ProductionHttpComparisonSchema).check(Schema.isNonEmpty()),
  }),
]);

export const Plan097OperationResponseSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.worker-response.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: OperationIdSchema,
  action: Plan097OperationActionSchema,
  outcome: Schema.Literals(["pass", "failed_as_expected"]),
  releaseId: ReleaseIdSchema,
  activationBundleSha256: Sha256Schema,
  receiptKey: Plan097ReceiptKeySchema,
  statementCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  objectCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  metrics: Plan097OperationMetricsSchema,
  evidence: Schema.optionalKey(Schema.Array(Plan097EvidenceRefSchema)),
  preflightReceiptBase64: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  proofState: Schema.optionalKey(
    Schema.Struct({
      phase: Schema.Literals(["injected-failure", "candidate-active", "baseline-restored"]),
      election: Schema.Struct({
        studioReleaseId: Schema.NullOr(ReleaseIdSchema),
        mapReleaseId: Schema.NullOr(ReleaseIdSchema),
        exactRouteReleaseId: Schema.NullOr(ReleaseIdSchema),
      }),
      protectedFingerprintCount: NonNegativeIntegerSchema,
    }),
  ),
});

export const Plan097WorkerReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.worker-receipt.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: OperationIdSchema,
  action: Plan097OperationActionSchema,
  outcome: Schema.Literals(["pass", "failed_as_expected"]),
  releaseId: ReleaseIdSchema,
  activationBundleSha256: Sha256Schema,
  completedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  statementCount: NonNegativeIntegerSchema,
  objectCount: NonNegativeIntegerSchema,
  metrics: Plan097OperationMetricsSchema,
  evidence: Schema.optionalKey(Schema.Array(Plan097EvidenceRefSchema)),
  preflightReceiptBase64: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  proofState: Schema.optionalKey(
    Schema.Struct({
      phase: Schema.Literals(["injected-failure", "candidate-active", "baseline-restored"]),
      election: Schema.Struct({
        studioReleaseId: Schema.NullOr(ReleaseIdSchema),
        mapReleaseId: Schema.NullOr(ReleaseIdSchema),
        exactRouteReleaseId: Schema.NullOr(ReleaseIdSchema),
      }),
      protectedFingerprintCount: NonNegativeIntegerSchema,
    }),
  ),
});

export const Plan097ProofSummarySchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.proof-summary.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: OperationIdSchema,
  completedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  candidateReleaseId: ReleaseIdSchema,
  previousReleaseId: ReleaseIdSchema,
  activationBundleSha256: Sha256Schema,
  restoreBundleSha256: Sha256Schema,
  criticalReceiptKeys: Schema.Array(Plan097ReceiptKeySchema).check(Schema.isNonEmpty()),
  receiptSet: Plan097OperationReceiptSetSchema,
  httpComparisons: Schema.Array(Plan097ProofHttpComparisonSchema).check(Schema.isNonEmpty()),
});

export const Plan097CompletionReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.completion.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: OperationIdSchema,
  completedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  outcome: Schema.Literals(["active", "rolled_back"]),
  candidateReleaseId: ReleaseIdSchema,
  previousReleaseId: ReleaseIdSchema,
  activationBundleSha256: Sha256Schema,
  preflightReceiptSha256: Sha256Schema,
  restoreBundleSha256: Sha256Schema,
  proofSummary: Plan097EvidenceRefSchema,
  criticalProductionReceiptKeys: Schema.Array(Plan097ReceiptKeySchema).check(Schema.isNonEmpty()),
  productionReceiptSet: Plan097OperationReceiptSetSchema,
  httpComparisons: Schema.Array(Plan097ProductionHttpComparisonSchema).check(Schema.isNonEmpty()),
  costComparison: Schema.Struct({
    preview: Schema.Struct({
      d1Statements: NonNegativeIntegerSchema,
      d1Bytes: NonNegativeIntegerSchema,
      r2Puts: NonNegativeIntegerSchema,
      r2Bytes: NonNegativeIntegerSchema,
    }),
    actualUsage: Plan097OperationUsageSchema,
  }),
});

export type Plan097OperationRequest = typeof Plan097OperationRequestSchema.Type;
export type Plan097CompletionReceipt = typeof Plan097CompletionReceiptSchema.Type;
export type Plan097OperationResponse = typeof Plan097OperationResponseSchema.Type;
export type Plan097OperationMetrics = typeof Plan097OperationMetricsSchema.Type;
export type Plan097OperationUsage = typeof Plan097OperationUsageSchema.Type;
export type Plan097ProofSummary = typeof Plan097ProofSummarySchema.Type;
export type Plan097WorkerReceipt = typeof Plan097WorkerReceiptSchema.Type;
export type Plan097HttpBaseline = typeof Plan097HttpBaselineSchema.Type;
